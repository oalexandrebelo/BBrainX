// Small allowlist reporter for the local test runner. Test stdout/stderr and
// diagnostics are deliberately omitted: they can contain arbitrary project data.
const short = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const MAX_PROJECT_OUTPUT = 4 * 1024 * 1024;

function failureError(details) {
  const error = details?.error ?? details?.errorDetails?.error ?? details?.error;
  const message = typeof error?.message === 'string'
    ? error.message
    : typeof error === 'string' ? error : 'Test failed without a message';
  const stack = typeof error?.stack === 'string' ? error.stack : '';
  return {message:short(message, 1200), stack:short(stack, 4000)};
}

export default async function* nodeTestReporter(source) {
  let projectOutputBytes = 0, outputLimitReported = false;
  for await (const event of source) {
    const data = event?.data && typeof event.data === 'object' ? event.data : {};
    if (event.type === 'test:stdout' || event.type === 'test:stderr') {
      projectOutputBytes += Buffer.byteLength(typeof data.message === 'string' ? data.message : '', 'utf8');
      if (projectOutputBytes > MAX_PROJECT_OUTPUT && !outputLimitReported) {
        outputLimitReported = true;
        yield JSON.stringify({type:'test:output-limit'}) + '\n';
      }
      continue;
    }
    if (outputLimitReported) continue;
    if (event.type === 'test:plan') {
      yield JSON.stringify({type:event.type, name:short(data.name, 300), nesting:count(data.nesting), count:count(data.count)}) + '\n';
    } else if (event.type === 'test:start') {
      yield JSON.stringify({type:event.type, name:short(data.name, 300), nesting:count(data.nesting), testType:data.type === 'suite' ? 'suite' : 'test'}) + '\n';
    } else if (event.type === 'test:pass' || event.type === 'test:fail') {
      const item = {
        type:event.type,
        name:short(data.name, 300),
        nesting:count(data.nesting),
        testType:data.type === 'suite' ? 'suite' : 'test',
        durationMs:Number.isFinite(data.details?.duration_ms) && data.details.duration_ms >= 0 ? data.details.duration_ms : null
      };
      if (event.type === 'test:fail') Object.assign(item, failureError(data.details));
      yield JSON.stringify(item) + '\n';
    } else if (event.type === 'test:summary') {
      const counts = data.counts && typeof data.counts === 'object' ? data.counts : {};
      yield JSON.stringify({
        type:event.type,
        counts:{
          cancelled:count(counts.cancelled), failed:count(counts.failed), passed:count(counts.passed),
          skipped:count(counts.skipped), tests:count(counts.tests), todo:count(counts.todo)
        },
        success:data.success === true,
        durationMs:Number.isFinite(data.duration_ms) && data.duration_ms >= 0 ? data.duration_ms : null,
        cumulative:!data.file
      }) + '\n';
    }
  }
}
