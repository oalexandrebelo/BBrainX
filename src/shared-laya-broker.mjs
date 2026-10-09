import { createHash, randomUUID } from 'node:crypto';
import { LayaBroker, LAYA } from './laya.mjs';
import { SharedAdmission, AdmissionError } from './shared-admission.mjs';

const digest = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Ponte opt-in para o perfil existente. Reserva a residência do worker, não só a espera HTTP.
 * Mantém pesos residentes entre decisões até stop/close explícito. Outro cliente recebe backpressure.
 * Não é daemon de pesos compartilhados, scheduler de GPU, sandbox ou autorização de ação.
 */
export class SharedLayaBroker {
  #ledger; #inner; #lease = null; #active = null; #closing = null; #closed = false; #disposing = false;
  #resource; #bytes; #scope; #session = randomUUID(); #proof = null;
  constructor({ home, resource, scopeDigest, reserveBytes, historyLimit = 100000, ...workerOptions }) {
    if (typeof resource !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(resource) ||
      typeof scopeDigest !== 'string' || !/^[a-f0-9]{64}$/.test(scopeDigest) || !Number.isSafeInteger(reserveBytes) || reserveBytes <= 0 || reserveBytes > 8 * 1024 ** 4)
      throw new AdmissionError('INVALID_SHARED_LAYA_CONFIG');
    this.#inner = new LayaBroker({ home, ...workerOptions });
    this.#resource = resource; this.#bytes = reserveBytes; this.#scope = scopeDigest;
    this.#ledger = new SharedAdmission(home, { historyLimit, reconcileVerifier: (row, proof) =>
      this.#lease !== null && row.generation === this.#lease.handle.generation && row.resource === this.#resource &&
      row.ledgerId === this.#ledger.ledgerId && proof.kind === 'owned-process-closed' &&
      proof.evidenceDigest === this.#proof && this.#inner.stats().processClosedObserved === true });
  }
  get info() { return this.#inner.info; }
  stats() {
    return { transport: this.#inner.stats(), admission: this.#lease ? {
      ledgerId: this.#ledger.ledgerId, generation: this.#lease.handle.generation,
      resource: this.#resource, state: this.#lease.state, revision: this.#lease.revision,
      reservedBytes: this.#bytes, scope: 'worker-residency'
    } : null, closed: this.#closed };
  }
  #settleClosed() {
    if (!this.#lease) return true;
    if (!this.#inner.stats().processClosedObserved) return false;
    const lease = this.#lease;
    // A observação é deste ChildProcess. Não usa PID, tempo decorrido ou porta como autoridade.
    this.#proof = digest({ kind: 'owned-process-closed', session: this.#session,
      ledgerId: this.#ledger.ledgerId, generation: lease.handle.generation, transport: this.#inner.stats() });
    try {
      if (lease.state === 'running') this.#ledger.release(lease.handle, { expectedRevision: lease.revision, evidenceDigest: this.#proof });
      else this.#ledger.reconcile({ ledgerId: this.#ledger.ledgerId, generation: lease.handle.generation,
        expectedRevision: lease.revision, kind: 'owned-process-closed', evidenceDigest: this.#proof });
      this.#lease = null; return true;
    } finally { this.#proof = null; }
  }
  #markUnknown(reason) {
    if (!this.#lease || this.#lease.state !== 'running') return;
    const result = this.#ledger.markUnknown(this.#lease.handle, { expectedRevision: this.#lease.revision, reason });
    this.#lease.state = result.state; this.#lease.revision = result.revision;
  }
  decide(states, questions, options = {}) {
    if (this.#closed || this.#disposing || this.#closing) return Promise.resolve({ ok: false, reason: 'SHARED_BROKER_CLOSED_OR_CLOSING' });
    if (this.#active) return Promise.resolve({ ok: false, reason: 'BUSY' });
    // Capture antes do primeiro microtask; AbortSignal conserva sua identidade, não é clonado.
    let captured;
    try {
      if (!options || typeof options !== 'object' || Array.isArray(options)) return Promise.resolve({ ok: false, reason: 'INVALID_REQUEST' });
      captured = [structuredClone(states), structuredClone(questions), { ...options }];
    } catch { return Promise.resolve({ ok: false, reason: 'INVALID_REQUEST' }); }
    // Promessa atribuída antes da execução: nenhum chamador divide o transient state da admissão.
    const work = Promise.resolve().then(() => this.#decide(...captured));
    this.#active = work;
    void work.then(() => { if (this.#active === work) this.#active = null; }, () => { if (this.#active === work) this.#active = null; });
    return work;
  }
  async #decide(states, questions, options) {
    try {
      if (this.#disposing || this.#closing) return { ok: false, reason: 'SHARED_BROKER_CLOSED_OR_CLOSING' };
      if (this.#lease?.state === 'unknown') {
        if (!this.#settleClosed()) return { ok: false, reason: 'SHARED_OUTCOME_UNKNOWN' };
      }
      if (!this.#lease) {
        const reserved = this.#ledger.acquire({ resource: this.#resource, scopeDigest: this.#scope, bytes: this.#bytes,
          requestDigest: digest({ kind: 'laya-worker-residency', manifest: LAYA.revision, checkpoint: LAYA.checkpoint, session: this.#session }) });
        if (!reserved.ok) return reserved;
        this.#lease = { handle: reserved.handle, state: 'running', revision: 1 };
      }
      const result = await this.#inner.decide(states, questions, options);
      if (!this.#settleClosed() && this.#inner.stats().state === 'retiring') this.#markUnknown('close-unconfirmed');
      return result;
    } catch (e) {
      // Não prometer rollback de inferência; stop observa o filho e mantém a reserva se houver dúvida.
      try { await this.#inner.stop(); if (!this.#settleClosed()) this.#markUnknown('close-unconfirmed'); } catch {}
      return { ok: false, reason: e instanceof AdmissionError ? e.code : 'SHARED_BROKER_FAILED' };
    }
  }
  stop() {
    if (this.#closed) return Promise.resolve({ released: this.#lease === null });
    if (this.#closing) return this.#closing;
    const work = Promise.resolve().then(async () => {
      await this.#inner.stop();
      if (this.#active) await this.#active;
      const released = this.#settleClosed();
      if (!released) this.#markUnknown('close-unconfirmed');
      return { released, reservation: this.stats().admission };
    });
    this.#closing = work;
    void work.then(() => { if (this.#closing === work) this.#closing = null; }, () => { if (this.#closing === work) this.#closing = null; });
    return work;
  }
  async close() {
    this.#disposing = true;
    const result = await this.stop();
    if (!this.#closed) { this.#ledger.close(); this.#closed = true; }
    return result;
  }
}
