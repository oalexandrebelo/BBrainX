import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const LIMIT = 8 * 1024 * 1024;
const validMs = ms => Number.isSafeInteger(ms) && ms > 0 && ms <= 300000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Canal de um worker cooperativo: um pedido em voo; nenhuma fila de trabalho oculta.
 * Só o host escolhe command/args. Não é uma sandbox nem supervisor de descendentes.
 * A vaga pertence à geração até observar `close`, não até `kill()` retornar true.
 */
export class JsonLineWorker {
  #current = null;
  #starting = null;
  #busy = false;
  #sequence = 0;
  #counts = { spawned: 0, requests: 0, rejectedBusy: 0, timeouts: 0, protocolErrors: 0 };
  #command; #startMs; #maxBytes; #shutdownMs; #graceMs; #acceptReady;

  constructor({ command, startMs = 90000, maxBytes = 2 * 1024 * 1024,
    shutdownMs = 1500, graceMs = 250, acceptReady = value => value?.ok === true } = {}) {
    if (!Array.isArray(command) || !command.length || command.some(x => typeof x !== 'string' || !x.length || x.includes('\0')) ||
        !validMs(startMs) || !validMs(shutdownMs) || !validMs(graceMs) || graceMs > shutdownMs ||
        !Number.isSafeInteger(maxBytes) || maxBytes < 128 || maxBytes > LIMIT || typeof acceptReady !== 'function')
      throw new TypeError('INVALID_WORKER_CONFIGURATION');
    this.#command = [...command]; this.#startMs = startMs; this.#maxBytes = maxBytes;
    this.#shutdownMs = shutdownMs; this.#graceMs = graceMs; this.#acceptReady = acceptReady;
  }

  get ready() { return this.#current?.status === 'ready' ? structuredClone(this.#current.ready) : null; }
  stats() { return { ...this.#counts, inFlight: Number(this.#busy), generation: this.#current?.number ?? null,
    state: this.#current?.status ?? 'absent', queueLength: 0, processClosedObserved: this.#current === null }; }

  #finish(gen, value) {
    const waiter = gen.waiter;
    if (!waiter) return;
    gen.waiter = null; clearTimeout(waiter.timer);
    waiter.resolve(value);
  }
  #wait(gen, id, ms) {
    if (gen.waiter) throw new Error('WORKER_WAIT_INVARIANT');
    return new Promise(resolve => {
      gen.waiter = { id, resolve, expires: performance.now() + ms,
        timer: setTimeout(() => { this.#counts.timeouts++; this.#finish(gen, { ok: false, reason: 'TIMEOUT' }); this.#retire(gen); }, ms) };
    });
  }
  #retire(gen) {
    if (!gen || gen.status === 'retiring' || gen.status === 'closed') return;
    gen.status = 'retiring'; gen.ready = null;
    this.#finish(gen, { ok: false, reason: 'UNAVAILABLE' });
    gen.child.stdin.destroy();
    // Somente o ChildProcess criado por esta instância recebe sinais. Nunca lookup por PID/porta.
    try { if (!gen.exited) gen.child.kill('SIGTERM'); } catch { /* close continua sendo necessário */ }
    gen.killTimer = setTimeout(() => {
      if (gen.status !== 'closed' && !gen.exited) { try { gen.child.kill('SIGKILL'); } catch { /* retenção conservadora */ } }
    }, this.#graceMs);
    gen.killTimer.unref();
  }
  async #drain(gen) {
    if (!gen || gen.status === 'closed') return true;
    this.#retire(gen);
    let timer;
    await Promise.race([gen.closed, new Promise(resolve => { timer = setTimeout(resolve, this.#shutdownMs); })]);
    clearTimeout(timer);
    return gen.status === 'closed';
  }
  #bad(gen, reason = 'PROTOCOL_ERROR') {
    this.#counts.protocolErrors++;
    this.#finish(gen, { ok: false, reason }); this.#retire(gen);
  }
  #data(gen, chunk) {
    if (gen.status === 'retiring' || gen.status === 'closed') return;
    // Buffer geométrico limitado: evita uma lista de um milhão de fragmentos de um byte.
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset), end = newline < 0 ? chunk.length : newline;
      const length = end - offset, required = gen.used + length;
      if (required > this.#maxBytes) return this.#bad(gen, 'RESPONSE_TOO_LARGE');
      if (required > gen.buffer.length) {
        const grown = Buffer.allocUnsafe(Math.min(this.#maxBytes, Math.max(required, gen.buffer.length * 2)));
        gen.buffer.copy(grown, 0, 0, gen.used); gen.buffer = grown;
      }
      chunk.copy(gen.buffer, gen.used, offset, end); gen.used = required;
      if (newline < 0) return;
      let message;
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(gen.buffer.subarray(0, gen.used));
        gen.used = 0;
        if (!text.trim()) { offset = end + 1; continue; }
        message = JSON.parse(text);
      } catch { return this.#bad(gen); }
      if (!object(message)) return this.#bad(gen);
      const id = message.op === 'ready' ? 'ready' : message.id, waiter = gen.waiter;
      if (!waiter || id !== waiter.id) return this.#bad(gen);
      // Um callback de timer atrasado não amplia o deadline depois de trabalho síncrono.
      if (performance.now() >= waiter.expires) {
        this.#counts.timeouts++; this.#finish(gen, { ok: false, reason: 'TIMEOUT' }); this.#retire(gen); return;
      }
      this.#finish(gen, { ok: true, message }); offset = end + 1;
      if (gen.status === 'retiring' || gen.status === 'closed') return;
    }
  }

  async #launch() {
    const [command, ...args] = this.#command;
    let child;
    try { child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'], shell: false, windowsHide: true }); }
    catch { return false; }
    const gen = { child, number: ++this.#sequence, status: 'starting', ready: null, used: 0,
      buffer: Buffer.allocUnsafe(Math.min(4096, this.#maxBytes)), waiter: null };
    gen.closed = new Promise(resolve => { gen.closedResolve = resolve; }); this.#current = gen; this.#counts.spawned++;
    const ready = this.#wait(gen, 'ready', this.#startMs);
    child.once('exit', () => { gen.exited = true; });
    child.on('error', () => { this.#finish(gen, { ok: false, reason: 'UNAVAILABLE' }); this.#retire(gen); });
    child.once('close', () => {
      clearTimeout(gen.killTimer); gen.status = 'closed'; gen.ready = null; gen.buffer = null;
      this.#finish(gen, { ok: false, reason: 'UNAVAILABLE' });
      if (this.#current === gen) this.#current = null;
      gen.closedResolve();
    });
    child.stdin.on('error', () => { this.#finish(gen, { ok: false, reason: 'UNAVAILABLE' }); this.#retire(gen); });
    child.stdout.on('data', chunk => this.#data(gen, chunk));
    const reply = await ready;
    let accepted = false;
    try { accepted = reply.ok && this.#acceptReady(reply.message) === true; } catch { /* recusa */ }
    if (!accepted || gen.status !== 'starting') { await this.#drain(gen); return false; }
    gen.ready = structuredClone(reply.message); gen.status = 'ready'; return true;
  }
  start() {
    if (this.#current?.status === 'ready') return Promise.resolve(true);
    if (this.#starting) return this.#starting;
    if (this.#current) return Promise.resolve(false);
    const pending = this.#launch(); this.#starting = pending;
    void pending.then(() => { if (this.#starting === pending) this.#starting = null; }, () => { if (this.#starting === pending) this.#starting = null; });
    return pending;
  }
  /** Input já limitado/serializado pelo adapter; nunca executa shell nem aceita ID externo de resposta. */
  async request(payload, { deadlineMs = 4000, signal, validate = () => true } = {}) {
    if (this.#busy) { this.#counts.rejectedBusy++; return { ok: false, reason: 'BUSY' }; }
    if (!object(payload) || !validMs(deadlineMs) || typeof validate !== 'function' ||
        (signal !== undefined && !(signal instanceof AbortSignal))) return { ok: false, reason: 'INVALID_REQUEST' };
    if (signal?.aborted) return { ok: false, reason: 'CANCELLED' };
    let line, expected;
    try {
      expected = String(++this.#sequence);
      line = JSON.stringify({ ...payload, id: expected }) + '\n';
      if (Buffer.byteLength(line) > this.#maxBytes) return { ok: false, reason: 'REQUEST_TOO_LARGE' };
    } catch { return { ok: false, reason: 'INVALID_REQUEST' }; }
    this.#busy = true;
    const abort = () => { const gen = this.#current; this.#finish(gen ?? {}, { ok: false, reason: 'CANCELLED' }); this.#retire(gen); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      if (!await this.start()) return { ok: false, reason: signal?.aborted ? 'CANCELLED' : 'UNAVAILABLE' };
      const gen = this.#current;
      if (signal?.aborted) { await this.#drain(gen); return { ok: false, reason: 'CANCELLED' }; }
      if (!gen || gen.status !== 'ready') return { ok: false, reason: 'UNAVAILABLE' };
      const reply = this.#wait(gen, expected, deadlineMs); this.#counts.requests++;
      gen.child.stdin.write(line, error => { if (error) { this.#finish(gen, { ok: false, reason: 'UNAVAILABLE' }); this.#retire(gen); } });
      const result = await reply;
      if (!result.ok) { await this.#drain(gen); return result; }
      let accepted = false;
      try { accepted = validate(result.message) === true; } catch { /* falha de contrato */ }
      if (!accepted) { this.#counts.protocolErrors++; await this.#drain(gen); return { ok: false, reason: 'INVALID_RESPONSE' }; }
      if (gen.status !== 'ready') { await this.#drain(gen); return { ok: false, reason: 'PROTOCOL_ERROR' }; }
      return result;
    } catch { await this.#drain(this.#current); return { ok: false, reason: 'UNAVAILABLE' }; }
    finally { signal?.removeEventListener('abort', abort); this.#busy = false; }
  }
  stop() { return this.#drain(this.#current); }
}
