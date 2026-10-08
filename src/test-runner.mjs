import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {gitState} from './host.mjs';
import {verifyRoot} from './source-root.mjs';
import {ensure, identifier, newId, now} from './primitives.mjs';

const MAX_FILES = 100;
const MAX_STDOUT = 4 * 1024 * 1024;
const MAX_LINE = 64 * 1024;
const MAX_FAILURES = 20;
const MAX_FAILURE_DIAGNOSTICS = 32 * 1024;
const MAX_FAILURE_ITEM = 1600;
const UPDATE_INTERVAL = 200;
const PROGRESS_HEARTBEAT_MS = 1000;
const KILL_GRACE_MS = 750;
const CLOSE_GRACE_MS = 1200;
const CALLBACK_TIMEOUT_MS = 5000;
const reporterPath = fileURLToPath(new URL('./node-test-reporter.mjs', import.meta.url));

function truncateUtf8(value, maximumBytes) {
  const clean = typeof value === 'string' ? value.replaceAll('\0', '') : '';
  let result = '', size = 0;
  for (const character of clean) {
    const bytes = Buffer.byteLength(character, 'utf8');
    if (size + bytes > maximumBytes) break;
    result += character; size += bytes;
  }
  return result;
}
function appendFailure(record, event) {
  if (record.failures.length >= MAX_FAILURES) { record.failuresTruncated = true; return; }
  const failure = {
    name:truncateUtf8(event.name, 300),
    message:truncateUtf8(event.message, 700),
    stack:truncateUtf8(event.stack, 700)
  };
  if (failure.name !== event.name || failure.message !== event.message || failure.stack !== event.stack) record.failuresTruncated = true;
  const currentSize = Buffer.byteLength(JSON.stringify(record.failures)), separator = record.failures.length ? 1 : 0;
  const allowed = Math.min(MAX_FAILURE_ITEM, MAX_FAILURE_DIAGNOSTICS - currentSize - separator);
  const size = () => Buffer.byteLength(JSON.stringify(failure));
  for (const field of ['stack','message','name']) {
    while (size() > allowed && failure[field]) {
      const before = failure[field], byteLength = Buffer.byteLength(before), over = size() - allowed;
      failure[field] = truncateUtf8(before, Math.max(0, byteLength - Math.max(32, over)));
      record.failuresTruncated = true;
      if (failure[field] === before) break;
    }
  }
  if (size() > allowed) { record.failuresTruncated = true; return; }
  record.failures.push(failure);
}

function validateFiles(root, files) {
  ensure(Array.isArray(files) && files.length > 0, 'INVALID_TEST_FILES', 'Informe ao menos um arquivo de teste.');
  ensure(files.length <= MAX_FILES, 'TOO_MANY_TEST_FILES', `O limite é ${MAX_FILES} arquivos por execução.`);
  const actual = [];
  for (const file of files) {
    ensure(typeof file === 'string' && file.length > 0 && file.length <= 1000 && !file.includes('\0'), 'INVALID_TEST_FILE');
    const normalized = file.replaceAll('\\', '/');
    const parts = normalized.split('/');
    ensure(!path.isAbsolute(file) && !path.win32.isAbsolute(file) && !/^[A-Za-z]:/.test(file)
      && !file.startsWith('-') && !/[?*\[\]{}!]/.test(file)
      && parts.every(part => part && part !== '.' && part !== '..'), 'INVALID_TEST_FILE', 'Use um caminho relativo concreto dentro da raiz registrada.');
    let candidate = path.resolve(root, ...parts);
    let cursor = root;
    for (const part of parts) {
      cursor = path.join(cursor, part);
      const stat = fs.lstatSync(cursor);
      ensure(!stat.isSymbolicLink(), 'INVALID_TEST_FILE', 'Arquivos de teste por symlink não são aceitos.');
    }
    const stat = fs.statSync(candidate);
    ensure(stat.isFile(), 'INVALID_TEST_FILE', 'O caminho precisa apontar para um arquivo regular.');
    const real = fs.realpathSync(candidate), relative = path.relative(root, real);
    ensure(relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep), 'INVALID_TEST_FILE');
    actual.push(real);
  }
  return actual;
}

function childEnvironment(tempHome) {
  const env = {
    PATH:process.env.PATH || '', HOME:tempHome, TMPDIR:tempHome,
    LANG:process.env.LANG || 'C.UTF-8'
  };
  if (process.platform === 'win32') {
    env.TEMP = tempHome; env.TMP = tempHome; env.USERPROFILE = tempHome;
    for (const key of ['SystemRoot','WINDIR','COMSPEC','PATHEXT']) if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

function validReporterEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const onlyKeys = allowed => Object.keys(value).every(key => allowed.includes(key));
  if (value.type === 'test:plan') return onlyKeys(['type','name','nesting','count'])
    && typeof value.name === 'string' && Number.isSafeInteger(value.nesting) && value.nesting >= 0
    && Number.isSafeInteger(value.count) && value.count >= 0;
  if (value.type === 'test:start') return onlyKeys(['type','name','nesting','testType'])
    && typeof value.name === 'string' && Number.isSafeInteger(value.nesting) && value.nesting >= 0
    && ['test','suite'].includes(value.testType);
  if (value.type === 'test:pass' || value.type === 'test:fail') {
    const allowed = value.type === 'test:fail'
      ? ['type','name','nesting','testType','durationMs','message','stack']
      : ['type','name','nesting','testType','durationMs'];
    return onlyKeys(allowed) && typeof value.name === 'string' && Number.isSafeInteger(value.nesting) && value.nesting >= 0
      && ['test','suite'].includes(value.testType) && (value.durationMs === null || (Number.isFinite(value.durationMs) && value.durationMs >= 0))
      && (value.type !== 'test:fail' || (typeof value.message === 'string' && typeof value.stack === 'string'));
  }
  if (value.type === 'test:summary') {
    const countKeys = ['cancelled','failed','passed','skipped','tests','todo'];
    return onlyKeys(['type','counts','success','durationMs','cumulative'])
      && value.counts && typeof value.counts === 'object' && !Array.isArray(value.counts)
      && Object.keys(value.counts).length === countKeys.length
      && countKeys.every(key => Number.isSafeInteger(value.counts[key]) && value.counts[key] >= 0)
      && typeof value.success === 'boolean' && typeof value.cumulative === 'boolean'
      && (value.durationMs === null || (Number.isFinite(value.durationMs) && value.durationMs >= 0));
  }
  if (value.type === 'test:output-limit') return onlyKeys(['type']) && Object.keys(value).length === 1;
  return false;
}

function summaryCounts(summary) {
  if (!summary) return;
  return {
    passed:summary.counts.passed,
    failed:summary.counts.failed,
    total:summary.counts.tests,
    completed:summary.counts.passed + summary.counts.failed + summary.counts.cancelled + summary.counts.skipped + summary.counts.todo
  };
}

/**
 * Run explicitly selected Node tests in the registered project directory.
 * This is a local process, not a security sandbox; test code has the OS user's authority.
 */
export async function runProjectTests(brain, {
  project, task = 'tests', files, timeoutMs = 300_000, node = process.execPath, onUpdate, signal
} = {}) {
  identifier(project);
  identifier(task);
  ensure(Number.isSafeInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 3_600_000, 'INVALID_TEST_TIMEOUT');
  ensure(typeof node === 'string' && node.length > 0 && !node.includes('\0') && path.isAbsolute(node), 'INVALID_TEST_NODE', 'O executável Node precisa ser um caminho absoluto.');
  ensure(typeof onUpdate === 'undefined' || typeof onUpdate === 'function', 'INVALID_TEST_CALLBACK');
  ensure(!signal || typeof signal.addEventListener === 'function', 'INVALID_TEST_SIGNAL');
  const registered = brain.project(project);
  verifyRoot(registered.root);
  const root = fs.realpathSync(registered.root);
  ensure(fs.statSync(root).isDirectory(), 'UNSAFE_PROJECT_ROOT');
  const selectedFiles = validateFiles(root, files);
  const nodePath = fs.realpathSync(node);
  ensure(fs.statSync(nodePath).isFile(), 'INVALID_TEST_NODE');

  const started = Date.now(), startedAt = now();
  const git = gitState(root);
  const record = {
    id:newId(), task, harness:'bbrainx', runner:'node:test', project, status:'running',
    startedAt, finishedAt:null, exitCode:null, passed:null, failed:null, total:null, completed:0,
    failures:[], failuresTruncated:false, durationMs:null, revision:git?.head ?? null, branch:git?.branch ?? null,
    errorCode:null, signal:null, stderrBytes:0, stderrTruncated:false
  };
  let lastPublish = 0, publishTimer = null, publishing = false, pendingSnapshot = null, callbackError = null;
  const finalPublishWaiters = [];
  const settlePublishWaiters = () => {
    if (publishing || pendingSnapshot) return;
    for (const resolve of finalPublishWaiters.splice(0)) resolve();
  };
  const schedulePublish = () => {
    if (!onUpdate || callbackError || publishing || !pendingSnapshot || publishTimer) return;
    const wait = Math.max(0, UPDATE_INTERVAL - (Date.now() - lastPublish));
    publishTimer = setTimeout(() => {
      publishTimer = null;
      void flushPublish();
    }, wait);
  };
  const flushPublish = async () => {
    if (!onUpdate || callbackError || publishing || !pendingSnapshot) { settlePublishWaiters(); return; }
    const wait = UPDATE_INTERVAL - (Date.now() - lastPublish);
    if (wait > 0) { schedulePublish(); return; }
    const snapshot = pendingSnapshot;
    pendingSnapshot = null;
    publishing = true;
    lastPublish = Date.now();
    let timer;
    try {
      await Promise.race([
        Promise.resolve().then(() => onUpdate(snapshot)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Run update timed out'), {code:'UPDATE_CALLBACK_TIMEOUT'})), CALLBACK_TIMEOUT_MS); })
      ]);
    } catch (error) {
      callbackError = error;
      pendingSnapshot = null;
      terminate('callback');
    } finally {
      clearTimeout(timer);
      publishing = false;
    }
    if (pendingSnapshot) schedulePublish();
    else settlePublishWaiters();
  };
  const publish = final => {
    if (!onUpdate || callbackError) return Promise.resolve();
    // Keep one active write and replace the pending snapshot with the newest state.
    pendingSnapshot = structuredClone(record);
    const completion = final ? new Promise(resolve => finalPublishWaiters.push(resolve)) : Promise.resolve();
    schedulePublish();
    return completion;
  };

  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bbrainx-test-run-'));
  if (process.platform !== 'win32') fs.chmodSync(tempHome, 0o700);
  let child, timeout, forceKill, forceKillPromise, closeWatchdog, progressHeartbeat, abortHandler, stdoutBytes = 0, stdoutBuffer = '', stderrSeen = 0;
  let protocolError = null, timedOut = false, cancelled = false, exited = false, closeResult = null;
  let summary = null, passEvents = 0, failEvents = 0;

  const signalGroup = name => {
    if (!child?.pid) return;
    try {
      if (process.platform === 'win32') child.kill(name === 'SIGKILL' ? 'SIGTERM' : name);
      else process.kill(-child.pid, name);
    } catch (error) {
      if (!['ESRCH','EPERM'].includes(error.code)) throw error;
    }
  };
  function terminate(reason) {
    if (!child || exited || record.status !== 'running') return;
    if (reason === 'timeout') timedOut = true;
    if (reason === 'abort') cancelled = true;
    if (reason === 'protocol') protocolError ||= 'INVALID_REPORTER_OUTPUT';
    if (reason === 'callback') protocolError ||= 'UPDATE_CALLBACK_FAILED';
    signalGroup('SIGTERM');
    if (!forceKill) forceKillPromise = new Promise(resolve => {
      forceKill = setTimeout(() => { signalGroup('SIGKILL'); resolve(); }, KILL_GRACE_MS);
    });
  }

  try {
    await publish(true);
    if (callbackError) throw callbackError;
    const reporter = pathToFileURL(reporterPath).href;
    child = spawn(nodePath, ['--test', '--test-reporter', reporter, ...selectedFiles], {
      cwd:root, env:childEnvironment(tempHome), stdio:['ignore','pipe','pipe'],
      shell:false, windowsHide:true, detached:process.platform !== 'win32'
    });
    timeout = setTimeout(() => terminate('timeout'), timeoutMs);
    progressHeartbeat = setInterval(() => { record.durationMs = Date.now() - started; publish(false); }, PROGRESS_HEARTBEAT_MS);
    if (signal) {
      abortHandler = () => terminate('abort');
      if (signal.aborted) abortHandler();
      else signal.addEventListener('abort', abortHandler, {once:true});
    }

    const decoder = new StringDecoder('utf8');
    const acceptLine = line => {
      if (!line) return;
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE) { terminate('protocol'); return; }
      let event;
      try { event = JSON.parse(line); } catch { terminate('protocol'); return; }
      if (!validReporterEvent(event)) { terminate('protocol'); return; }
      if (event.type === 'test:output-limit') {
        protocolError ||= 'TEST_OUTPUT_LIMIT';
        terminate('protocol');
        return;
      }
      if (event.type === 'test:pass' && event.testType === 'test') passEvents++;
      if (event.type === 'test:fail' && event.testType === 'test') {
        failEvents++;
        appendFailure(record, event);
      }
      if (event.type === 'test:summary' && event.cumulative) summary = event;
      if (summary) Object.assign(record, summaryCounts(summary));
      else {
        record.passed = passEvents;
        record.failed = failEvents;
        record.completed = passEvents + failEvents;
      }
      publish(false);
    };

    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT) { terminate('protocol'); return; }
      stdoutBuffer += decoder.write(chunk);
      if (Buffer.byteLength(stdoutBuffer, 'utf8') > MAX_LINE && !stdoutBuffer.includes('\n')) { terminate('protocol'); return; }
      let newline;
      while ((newline = stdoutBuffer.indexOf('\n')) !== -1) {
        const line = stdoutBuffer.slice(0, newline).replace(/\r$/, '');
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        acceptLine(line);
      }
      if (Buffer.byteLength(stdoutBuffer, 'utf8') > MAX_LINE) terminate('protocol');
    });
    child.stderr.on('data', chunk => {
      stderrSeen += chunk.length;
      record.stderrBytes = Math.min(stderrSeen, Number.MAX_SAFE_INTEGER);
      record.stderrTruncated = stderrSeen > 64 * 1024;
    });
    child.once('error', error => { record.errorCode ||= error.code || 'SPAWN_FAILED'; });
    child.once('exit', (code, exitSignal) => {
      exited = true; closeResult = {code, signal:exitSignal};
      if (closeWatchdog) clearTimeout(closeWatchdog);
      closeWatchdog = setTimeout(() => {
        if (process.platform !== 'win32') signalGroup('SIGTERM');
        child.stdout.destroy(); child.stderr.destroy();
      }, CLOSE_GRACE_MS);
    });
    await new Promise(resolve => child.once('close', (code, exitSignal) => {
      exited = true; closeResult = {code, signal:exitSignal}; resolve();
    }));
    stdoutBuffer += decoder.end();
    if (stdoutBuffer) acceptLine(stdoutBuffer.replace(/\r$/, ''));
    if (closeWatchdog) clearTimeout(closeWatchdog);
    if (forceKillPromise) await forceKillPromise;
    if (!timedOut && !cancelled && !protocolError && process.platform !== 'win32') {
      // A passing test process can still leave child processes in its session.
      signalGroup('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 100));
      signalGroup('SIGKILL');
    }
    record.exitCode = closeResult?.code ?? null;
    record.signal = closeResult?.signal ?? null;
    if (timedOut) record.status = 'timed_out';
    else if (cancelled) record.status = 'cancelled';
    else if (protocolError) { record.status = 'failed'; record.errorCode = protocolError; }
    else if (summary && summary.success && record.exitCode === 0) record.status = 'passed';
    else { record.status = 'failed'; record.errorCode ||= 'TEST_PROCESS_FAILED'; }
    if (!summary) {
      record.passed = null; record.failed = failEvents || null; record.total = null;
      record.completed = passEvents + failEvents;
    }
  } catch (error) {
    if (child && !exited) { terminate('protocol'); await new Promise(resolve => child.once('close', resolve)); }
    if (forceKillPromise) await forceKillPromise;
    if (callbackError && !child) throw callbackError;
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (progressHeartbeat) clearInterval(progressHeartbeat);
    if (forceKill) clearTimeout(forceKill);
    if (closeWatchdog) clearTimeout(closeWatchdog);
    if (publishTimer) { clearTimeout(publishTimer); publishTimer = null; }
    if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
    fs.rmSync(tempHome, {recursive:true, force:true});
  }

  record.durationMs = Math.max(0, Date.now() - started);
  record.finishedAt = now();
  if (callbackError) {
    record.status = 'failed'; record.errorCode = 'UPDATE_CALLBACK_FAILED';
    callbackError = null;
  }
  await publish(true);
  if (callbackError) { record.status = 'failed'; record.errorCode = 'UPDATE_CALLBACK_FAILED'; }
  return record;
}
