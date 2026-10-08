import { EngineError, ERROR_CODES } from './capability.mjs';

// Uma escrita já submetida pode falhar depois do prazo. Um listener sem captura de dados por
// stream evita erro tardio não observado e não acumula um listener por invocação.
const guardedStreams = new WeakSet();
function guardLateError(stream) {
  if (!guardedStreams.has(stream)) { stream.on('error', () => {}); guardedStreams.add(stream); }
}

/** Adapter CLI sem shell: identidade é fornecida pelo host, não por JSON/stdin. */
export async function runEngineCli(engine, { argv, principal, input = process.stdin, output = process.stdout,
  error = process.stderr, maxBytes = 1048576, deadlineMs = 30000, isFailure = () => false } = {}) {
  let timer;
  const controller = new AbortController();
  const emit = async (stream, data) => {
    const line = JSON.stringify(data) + '\n';
    if (Buffer.byteLength(line) > maxBytes) throw new Error('CLI_OUTPUT_LIMIT');
    guardLateError(stream);
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = failure => {
        if (settled) return; settled = true;
        stream.removeListener('error', onError); controller.signal.removeEventListener('abort', onAbort);
        failure ? reject(new Error(failure)) : resolve();
      };
      const onAbort = () => finish('CLI_DEADLINE');
      const onError = () => finish('CLI_WRITE_FAILED');
      if (controller.signal.aborted) return reject(new Error('CLI_DEADLINE'));
      stream.once('error', onError); controller.signal.addEventListener('abort', onAbort, { once: true });
      try { stream.write(line, err => finish(err ? 'CLI_WRITE_FAILED' : null)); }
      catch { finish('CLI_WRITE_FAILED'); }
    });
  };
  try {
    if (!Array.isArray(argv) || !argv.every(x => typeof x === 'string') || principal === undefined ||
        !Number.isSafeInteger(maxBytes) || maxBytes < 128 || maxBytes > 8 * 1024 * 1024 ||
        !Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 300000) return 2;
    const who = structuredClone(principal); argv = [...argv];
    timer = setTimeout(() => controller.abort(), deadlineMs);
    if (argv.length === 1 && argv[0] === 'list') { await emit(output, engine.list()); return 0; }
    if (argv.length === 2 && argv[0] === 'describe') { await emit(output, engine.describe(argv[1])); return 0; }
    if (argv.length !== 3 || argv[0] !== 'run' || argv[2] !== '--stdin') return 2;
    const bytes = await readBounded(input, maxBytes, controller.signal);
    let args;
    try { args = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return 2; }
    const result = await engine.invoke(argv[1], args, { principal: who, source: 'cli', signal: controller.signal });
    await emit(output, result);
    return isFailure(result) ? 1 : 0;
  } catch (cause) {
    const code = cause instanceof EngineError && ERROR_CODES.includes(cause.code) ? cause.code : 'CLI_FAILED';
    // Não copiar publicDetails: um schema de terceiro pode incluir valores sensíveis.
    try { guardLateError(error); error.write(JSON.stringify({ error: { code } }) + '\n'); } catch { /* diagnóstico best effort */ }
    return 1;
  } finally { clearTimeout(timer); }
}

function readBounded(stream, maxBytes, signal) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    const cleanup = () => {
      stream.removeListener('data', data); stream.removeListener('end', end); stream.removeListener('error', fail);
      stream.removeListener('close', close); signal.removeEventListener('abort', abort);
      stream.pause();
    };
    const fail = () => { cleanup(); reject(new Error('CLI_INPUT_FAILED')); };
    const data = chunk => {
      if (!Buffer.isBuffer(chunk)) return fail();
      size += chunk.length;
      if (size > maxBytes) return fail();
      chunks.push(chunk);
    };
    const end = () => { cleanup(); resolve(Buffer.concat(chunks, size)); };
    const close = () => { if (!stream.readableEnded) fail(); };
    const abort = () => fail();
    if (signal.aborted || stream.destroyed || stream.readableEnded) return fail();
    signal.addEventListener('abort', abort, { once: true });
    stream.on('data', data); stream.once('end', end); stream.once('error', fail); stream.once('close', close);
  });
}
