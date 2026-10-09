import { performance } from 'node:perf_hooks';

export class McpFlowError extends Error {
  constructor(code, message = code) { super(message); this.name = 'McpFlowError'; this.code = code; }
}
export function positiveLimit(value, name, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new TypeError('Invalid MCP limit: ' + name);
  return value;
}

/** Janela exata (t-perMs,t], não bucket aproximado. Recusas não consomem quota.
 * O relógio pertence ao host. Regressão/falta de finitude invalida esta instância.
 */
export class McpRateWindow {
  #times; #head = 0; #size = 0; #last = -Infinity; #broken = false;
  #calls; #perMs; #now;
  constructor({ calls = 300, perMs = 60000, now = () => performance.now() } = {}) {
    this.#calls = positiveLimit(calls, 'rateLimit.calls', 100000);
    this.#perMs = positiveLimit(perMs, 'rateLimit.perMs', 86400000);
    if (typeof now !== 'function') throw new TypeError('Invalid MCP clock');
    this.#now = now; this.#times = new Float64Array(calls);
  }
  take() {
    const time = this.#now();
    if (this.#broken || !Number.isFinite(time) || time < 0 || time < this.#last) {
      this.#broken = true; throw new McpFlowError('MCP_CLOCK_INVALID');
    }
    this.#last = time;
    while (this.#size && time - this.#times[this.#head] >= this.#perMs) {
      this.#head = (this.#head + 1) % this.#calls; this.#size--;
    }
    if (this.#size === this.#calls) return false;
    this.#times[(this.#head + this.#size) % this.#calls] = time; this.#size++;
    return true;
  }
  stats() { return { size: this.#size, capacity: this.#calls, perMs: this.#perMs, validClock: !this.#broken }; }
}

/** Uma linha UTF-8 estrita em buffer geométrico. Chunks do produtor não são retidos.
 * Não é zero-copy: cresce/copia amortizadamente e decodifica apenas o frame completo.
 */
export class McpLineBuffer {
  #buffer; #used = 0; #limit;
  constructor(maxBytes) {
    this.#limit = positiveLimit(maxBytes, 'maxLineBytes', 8 * 1024 * 1024);
    this.#buffer = Buffer.allocUnsafe(Math.min(4096, maxBytes));
  }
  feed(chunk, accept) {
    if (!Buffer.isBuffer(chunk)) throw new McpFlowError('MCP_INPUT_NOT_BYTES');
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf(10, start), end = newline < 0 ? chunk.length : newline;
      const needed = this.#used + end - start;
      if (needed > this.#limit) throw new McpFlowError('MCP_FRAME_LIMIT', 'The MCP stdio read buffer exceeded the configured limit of ' + this.#limit + ' bytes.');
      if (needed > this.#buffer.length) {
        const grown = Buffer.allocUnsafe(Math.min(this.#limit, Math.max(needed, this.#buffer.length * 2)));
        this.#buffer.copy(grown, 0, 0, this.#used); this.#buffer = grown;
      }
      chunk.copy(this.#buffer, this.#used, start, end); this.#used = needed;
      if (newline < 0) return;
      let line;
      try { line = new TextDecoder('utf-8', { fatal: true }).decode(this.#buffer.subarray(0, this.#used)); }
      catch { throw new McpFlowError('MCP_INVALID_UTF8'); }
      this.#used = 0;
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.trim() && accept(line) === false) return;
      start = end + 1;
    }
  }
  get remainingBytes() { return this.#used; }
  clear() { this.#buffer = Buffer.alloc(0); this.#used = 0; }
}

// Erros tardios de uma escrita já submetida continuam observados após o teardown.
// Um listener sem closure por stream, não um listener permanente por mensagem.
const guardedStreams = new WeakSet();
export function guardLateError(stream) {
  if (!guardedStreams.has(stream)) { stream.on('error', () => {}); guardedStreams.add(stream); }
}

/** Writer exclusivo do transporte. Uma escrita em voo; só avança após callback E,
 * quando write retornou false, drain. Mantém limites de bytes e frames incluindo o ativo.
 */
export class McpOutputQueue {
  #output; #queue = new Map(); #serial = 0; #active = null; #closed = false; #fatal;
  #maxFrame; #maxBytes; #maxFrames; #deadline; #bytes = 0;
  #peakBytes = 0; #peakFrames = 0; #sentFrames = 0; #sentBytes = 0;
  #onError; #onClose;
  constructor(output, { maxFrameBytes = 2 * 1024 * 1024, maxBytes = 4 * 1024 * 1024,
    maxFrames = 64, writeTimeoutMs = 5000, onFatal = () => {} } = {}) {
    this.#maxFrame = positiveLimit(maxFrameBytes, 'maxResponseBytes', 16 * 1024 * 1024);
    this.#maxBytes = positiveLimit(maxBytes, 'maxOutputBytes', 64 * 1024 * 1024);
    this.#maxFrames = positiveLimit(maxFrames, 'maxOutputFrames', 1024);
    this.#deadline = positiveLimit(writeTimeoutMs, 'writeTimeoutMs', 300000);
    if (maxFrameBytes > maxBytes || typeof onFatal !== 'function') throw new TypeError('Invalid MCP output policy');
    this.#output = output; this.#fatal = onFatal;
    guardLateError(output);
    this.#onError = error => this.#fail(new McpFlowError(error?.code === 'EPIPE' ? 'MCP_OUTPUT_EPIPE' : 'MCP_OUTPUT_FAILED'));
    this.#onClose = () => this.#fail(new McpFlowError('MCP_OUTPUT_CLOSED'));
    output.on('error', this.#onError); output.on('close', this.#onClose);
  }
  enqueue(message) {
    if (this.#closed) return Promise.reject(new McpFlowError('MCP_OUTPUT_CLOSED'));
    let text;
    try { text = JSON.stringify(message); }
    catch { this.#fail(new McpFlowError('MCP_OUTPUT_ENCODING')); return Promise.reject(new McpFlowError('MCP_OUTPUT_ENCODING')); }
    if (typeof text !== 'string') { this.#fail(new McpFlowError('MCP_OUTPUT_ENCODING')); return Promise.reject(new McpFlowError('MCP_OUTPUT_ENCODING')); }
    const bytes = Buffer.byteLength(text) + 1;
    const reason = bytes > this.#maxFrame ? 'MCP_RESPONSE_LIMIT' :
      (bytes + this.#bytes > this.#maxBytes || this.#queue.size >= this.#maxFrames) ? 'MCP_OUTPUT_LIMIT' : null;
    if (reason) { const error = new McpFlowError(reason); this.#fail(error); return Promise.reject(error); }
    const frame = Buffer.from(text + '\n');
    const promise = new Promise((resolve, reject) => {
      const entry = { id: ++this.#serial, frame, bytes, resolve, reject, timer: null, cleanup: null, enqueuedAt: performance.now() };
      this.#queue.set(entry.id, entry); this.#bytes += bytes;
      this.#peakBytes = Math.max(this.#peakBytes, this.#bytes); this.#peakFrames = Math.max(this.#peakFrames, this.#queue.size);
    });
    // Evita rejeição sem observador na interrupção síncrona de outra mensagem.
    void promise.catch(() => {}); this.#pump(); return promise;
  }
  #pump() {
    if (this.#closed || this.#active || !this.#queue.size) return;
    if (this.#output.destroyed || this.#output.writableEnded) { this.#fail(new McpFlowError('MCP_OUTPUT_CLOSED')); return; }
    const entry = this.#queue.values().next().value; this.#active = entry;
    // Prazo inclui tempo já gasto esperando na fila; uma fila lenta não renova deadlines.
    const remaining = this.#deadline - (performance.now() - entry.enqueuedAt);
    if (remaining <= 0) { this.#fail(new McpFlowError('MCP_WRITE_TIMEOUT')); return; }
    let callbackDone = false, returned = false, needsDrain = false, drained = false;
    const complete = () => {
      if (this.#closed || this.#active !== entry || !returned || !callbackDone || (needsDrain && !drained)) return;
      if (performance.now() - entry.enqueuedAt >= this.#deadline) { this.#fail(new McpFlowError('MCP_WRITE_TIMEOUT')); return; }
      clearTimeout(entry.timer); entry.cleanup();
      this.#queue.delete(entry.id); this.#bytes -= entry.bytes; this.#active = null;
      this.#sentFrames++; this.#sentBytes += entry.bytes; entry.frame = null; entry.resolve(); this.#pump();
    };
    const onDrain = () => { drained = true; complete(); };
    entry.cleanup = () => this.#output.removeListener('drain', onDrain);
    this.#output.once('drain', onDrain);
    entry.timer = setTimeout(() => this.#fail(new McpFlowError('MCP_WRITE_TIMEOUT')), remaining);
    try {
      const accepted = this.#output.write(entry.frame, error => {
        if (this.#closed || this.#active !== entry) return;
        if (error) { this.#onError(error); return; }
        callbackDone = true; complete();
      });
      needsDrain = !accepted; returned = true; complete();
    } catch { this.#fail(new McpFlowError('MCP_OUTPUT_FAILED')); }
  }
  #fail(error) { if (!this.#closed) { this.abort(error); this.#fatal(error); } }
  abort(error = new McpFlowError('MCP_OUTPUT_CLOSED')) {
    if (this.#closed) return;
    this.#closed = true;
    this.#output.removeListener('error', this.#onError); this.#output.removeListener('close', this.#onClose);
    for (const entry of this.#queue.values()) {
      clearTimeout(entry.timer); entry.cleanup?.(); entry.frame = null; entry.reject(error);
    }
    this.#queue.clear(); this.#bytes = 0; this.#active = null;
  }
  stats() { return { queuedFrames: this.#queue.size, queuedBytes: this.#bytes, peakFrames: this.#peakFrames,
    peakBytes: this.#peakBytes, sentFrames: this.#sentFrames, sentBytes: this.#sentBytes, closed: this.#closed }; }
}
