import { performance } from 'node:perf_hooks';
import { createWriteStream } from 'node:fs';
import { McpFlowError, McpLineBuffer, McpOutputQueue, positiveLimit, guardLateError } from './mcp-flow.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const validMcpRequestId = id => Number.isSafeInteger(id) ||
  (typeof id === 'string' && Buffer.byteLength(id) <= 1024);
const errorResponse = (code, message) => ({ jsonrpc: '2.0', id: null, error: { code, message } });

/** Transporte exclusivo, com política por conexão. Não é o admission ledger global.
 * IDs são retidos até a escrita concluir; duplicata ainda ativa encerra a conexão,
 * pois responder com o mesmo ID poderia completar a promessa errada no cliente.
 */
export async function serveBoundedStdio(handler, { maxLineBytes = 1048576, input = process.stdin,
  output = process.stdout, maxPendingMessages = 32, maxBatchItems = 32,
  maxResponseBytes = 2097152, maxOutputBytes = 4194304, maxOutputFrames = 64,
  writeTimeoutMs = 5000, shutdownMs = 1500 } = {}) {
  positiveLimit(maxPendingMessages, 'maxPendingMessages', 1024);
  positiveLimit(maxBatchItems, 'maxBatchItems', 128);
  positiveLimit(shutdownMs, 'shutdownMs', 30000);
  // O stdout de pipe do Node é síncrono no Windows. A variante fs assíncrona
  // mantém o event loop disponível para o prazo; não modifica métodos internos
  // de process.stdout e não fecha o descritor herdado do host.
  const ownsOutputAdapter = process.platform === 'win32' && output === process.stdout && !output.isTTY;
  if (ownsOutputAdapter) output = createWriteStream(null, { fd: output.fd, autoClose: false });
  const decoder = new McpLineBuffer(maxLineBytes), pending = new Set(), ids = new Map();
  let ending = false, terminated = false, fatal = null, scheduled = null, finishInput;
  let peakPending = 0, peakIds = 0, frames = 0, inputBytes = 0;
  const began = performance.now(), ended = new Promise(resolve => { finishInput = resolve; });
  const writer = new McpOutputQueue(output, { maxFrameBytes: maxResponseBytes, maxBytes: maxOutputBytes,
    maxFrames: maxOutputFrames, writeTimeoutMs, onFatal: error => stop(error) });

  function detachInput() {
    input.removeListener('readable', schedule); input.removeListener('end', onEnd);
    input.removeListener('close', onInputClose); input.removeListener('error', onInputError);
    clearImmediate(scheduled); scheduled = null;
  }
  function stop(error = null) {
    if (error && !fatal) fatal = error;
    if (error) { terminated = true; writer.abort(error); }
    if (!ending) {
      ending = true; detachInput(); handler.cancelAll(); finishInput();
    }
  }
  function onEnd() {
    if (decoder.remainingBytes) stop(new McpFlowError('MCP_INCOMPLETE_FRAME'));
    else stop();
  }
  function onInputClose() { if (!input.readableEnded) stop(new McpFlowError('MCP_INPUT_CLOSED')); }
  function onInputError() { stop(new McpFlowError('MCP_INPUT_FAILED')); }
  function send(message) {
    if (terminated || message === undefined || (Array.isArray(message) && message.length === 0)) return Promise.resolve();
    return writer.enqueue(message);
  }

  function dispatch(line) {
    if (ending) return false;
    frames++;
    let decoded;
    try { decoded = JSON.parse(line); }
    catch { return launch([], () => send(errorResponse(-32700, 'Parse error.'))); }
    const batch = Array.isArray(decoded);
    const messages = batch ? decoded : [decoded];
    if (batch && !messages.length) return launch([], () => send(errorResponse(-32600, 'Empty batch.')));
    if (messages.length > maxBatchItems) { stop(new McpFlowError('MCP_BATCH_LIMIT')); return false; }

    // Notificações não ocupam vaga de resposta e continuam cancelando com o gate de chamadas cheio.
    // Requests inválidos que gerariam erro com ID também participam da correlação.
    const requestIds = [];
    for (const message of messages) {
      const ignoredReply = object(message) && typeof message.method !== 'string' && ('result' in message || 'error' in message);
      if (object(message) && !ignoredReply && validMcpRequestId(message.id)) requestIds.push(message.id);
    }
    const selected = new Set(requestIds);
    if (selected.size !== requestIds.length || requestIds.some(id => ids.has(id))) {
      stop(new McpFlowError('MCP_DUPLICATE_REQUEST_ID')); return false;
    }
    const notificationOnly = messages.every(m => object(m) && m.jsonrpc === '2.0' && typeof m.method === 'string' && m.id === undefined);
    if (notificationOnly) {
      for (const message of messages) void handler.handle(message).catch(() => stop(new McpFlowError('MCP_HANDLER_FAILED')));
      return !ending;
    }
    return launch(requestIds, async () => {
      const responses = await Promise.all(messages.map(message => handler.handle(message)));
      await send(batch ? responses.filter(response => response !== undefined) : responses[0]);
    });
  }

  function launch(requestIds, work) {
    if (pending.size >= maxPendingMessages) { stop(new McpFlowError('MCP_PENDING_LIMIT')); return false; }
    const token = {};
    for (const id of requestIds) ids.set(id, token);
    peakIds = Math.max(peakIds, ids.size);
    // Começa sincronamente para uma notificação no mesmo chunk ver o request que cancela.
    let promise;
    try { promise = Promise.resolve(work()); }
    catch (error) { promise = Promise.reject(error); }
    const tracked = promise.catch(error => stop(error instanceof McpFlowError ? error : new McpFlowError('MCP_HANDLER_FAILED')))
      .finally(() => {
        for (const id of requestIds) if (ids.get(id) === token) ids.delete(id);
        pending.delete(tracked);
      });
    pending.add(tracked); peakPending = Math.max(peakPending, pending.size);
    return !ending;
  }

  // Um quantum limitado por volta do event loop. Não reter um chunk arbitrariamente
  // grande nem pausar a entrada por haver tools em voo (isso bloquearia cancelamentos).
  function pump() {
    scheduled = null;
    if (ending) return;
    try {
      const available = input.readableLength;
      const chunk = input.read(Math.min(65536, Math.max(1, available)));
      if (chunk !== null) {
        if (!Buffer.isBuffer(chunk)) throw new McpFlowError('MCP_INPUT_NOT_BYTES');
        inputBytes += chunk.length; decoder.feed(chunk, dispatch);
      }
    } catch (error) { stop(error instanceof McpFlowError ? error : new McpFlowError('MCP_INPUT_FAILED')); }
    if (!ending) {
      if (input.readableLength > 0) schedule();
      else input.read(0); // provoca end após consumir exatamente o último byte
    }
  }
  function schedule() { if (!ending && scheduled === null) scheduled = setImmediate(pump); }
  guardLateError(input);
  input.on('readable', schedule); input.once('end', onEnd);
  input.once('close', onInputClose); input.on('error', onInputError);
  if (output.destroyed || output.writableEnded) stop(new McpFlowError('MCP_OUTPUT_CLOSED'));
  else if (input.destroyed) stop(new McpFlowError('MCP_INPUT_CLOSED'));
  else if (input.readableEnded) onEnd();
  else schedule();
  await ended;

  // EOF cancela tools, mas deixa respostas já concluídas escoarem dentro do prazo.
  // Promise não cooperativa não pode manter serve() esperando para sempre.
  let timer, drained = false;
  await Promise.race([
    Promise.allSettled([...pending]).then(() => { drained = true; }),
    new Promise(resolve => { timer = setTimeout(resolve, shutdownMs); })
  ]);
  clearTimeout(timer);
  if (!drained && !fatal) fatal = new McpFlowError('MCP_SHUTDOWN_INCOMPLETE');
  terminated = true; detachInput(); writer.abort(); decoder.clear();
  // A stream é exclusiva; bytes já entregues ao kernel/cliente não podem ser retraídos.
  if (fatal) { input.destroy?.(); output.destroy?.(); }
  else if (ownsOutputAdapter) output.destroy();
  // Um write nativo já iniciado pode continuar aguardando o leitor mesmo após
  // a recusa do protocolo. O host ainda precisa observar exit/close do processo.
  const report = { frames, inputBytes, peakPending, peakIds, unsettledMessages: pending.size,
    drained, elapsedMs: performance.now() - began, handler: handler.stats(), output: writer.stats(),
    scope: 'per-stdio-connection', physicalWorkStopped: null, error: fatal?.code ?? null };
  if (fatal) { fatal.report = report; throw fatal; }
  return report;
}
