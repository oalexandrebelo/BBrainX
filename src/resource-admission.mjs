import { performance } from 'node:perf_hooks';
import { profileById } from './infrastructure.mjs';

/** Ledger por coordenador. Não soma RSS de outros processos, não é cgroup, não substitui autorização. */
export class ResourceAdmission {
  #leases = new Map(); #reserved = 0; #background = 0; #models = 0; #lastTime = -Infinity;
  #sample = null; #blocked = false; #healthySince = null; #sequence = 0;
  constructor({ profile = 'MEDIUM', clock = () => performance.now(), maxSampleAgeMs = 2000, recoveryMs = 5000 } = {}) {
    Object.defineProperty(this, "policy", { value: profileById(profile), enumerable: true });
    if (typeof clock !== 'function' || !Number.isSafeInteger(maxSampleAgeMs) || maxSampleAgeMs < 1 || maxSampleAgeMs > 60000 || !Number.isSafeInteger(recoveryMs) || recoveryMs < 0 || recoveryMs > 600000) throw new RangeError('INVALID_GOVERNOR_OPTIONS');
    this.clock = clock; this.maxSampleAgeMs = maxSampleAgeMs; this.recoveryMs = recoveryMs;
  }
  #now() {
    const value = this.clock();
    if (!Number.isFinite(value) || value < 0 || value < this.#lastTime) throw new Error('INVALID_MONOTONIC_CLOCK');
    this.#lastTime = value; return value;
  }
  observe({ availableBytes, observedAtMs, thermal = 'unknown', onBattery = null }) {
    const now = this.#now();
    if (!Number.isSafeInteger(availableBytes) || availableBytes < 0 || !Number.isFinite(observedAtMs) || observedAtMs < 0 || observedAtMs > now || !['nominal','warning','critical','unknown'].includes(thermal) || ![true,false,null].includes(onBattery)) throw new RangeError('INVALID_RESOURCE_SAMPLE');
    if (this.#sample && observedAtMs < this.#sample.at) throw new Error('OUT_OF_ORDER_SAMPLE');
    const bad = availableBytes < this.policy.hostReserveBytes || ['warning','critical'].includes(thermal);
    const fresh = now - observedAtMs <= this.maxSampleAgeMs;
    const distinct = !this.#sample || observedAtMs > this.#sample.at;
    // Lacuna sem observação não prova recuperação térmica contínua.
    if (this.#sample && observedAtMs - this.#sample.at > this.maxSampleAgeMs) { this.#blocked = true; this.#healthySince = null; }
    if (!fresh || bad) { this.#blocked = true; this.#healthySince = null; }
    else if (distinct && this.#blocked) {
      this.#healthySince ??= observedAtMs;
      if (observedAtMs - this.#healthySince >= this.recoveryMs) this.#blocked = false;
    }
    this.#sample = { availableBytes, at: observedAtMs, thermal, onBattery };
    return this.stats();
  }
  acquire({ bytes, kind = 'interactive', consent = false } = {}) {
    const now = this.#now(), p = this.policy, s = this.#sample;
    if (!Number.isSafeInteger(bytes) || bytes < 1 || !['interactive','background','model'].includes(kind) || typeof consent !== 'boolean') throw new RangeError('INVALID_RESERVATION');
    const reject = reason => ({ ok: false, reason });
    if (!s || now - s.at > this.maxSampleAgeMs) { this.#blocked = true; this.#healthySince = null; return reject('STALE_RESOURCE_SAMPLE'); }
    if (this.#blocked) return reject('RESOURCE_PRESSURE');
    if (kind !== 'interactive' && !consent) return reject('EXPLICIT_CONSENT_REQUIRED');
    if (kind !== 'interactive' && s.thermal !== 'nominal') return reject('THERMAL_STATE_NOT_VERIFIED');
    if (kind === 'background' && s.onBattery !== false) return reject('AC_POWER_NOT_VERIFIED');
    if (this.#leases.size >= p.maxConcurrent) return reject('CONCURRENCY_LIMIT');
    if (kind === 'model' && this.#models >= p.modelConcurrent) return reject('MODEL_LIMIT');
    if (kind === 'background' && this.#background >= p.backgroundConcurrent) return reject('BACKGROUND_LIMIT');
    if (bytes > p.runtimeBudgetBytes - this.#reserved || bytes > s.availableBytes - p.hostReserveBytes - this.#reserved) return reject('MEMORY_BUDGET');
    const token = Object.freeze({ sequence: ++this.#sequence });
    this.#leases.set(token, { bytes, kind }); this.#reserved += bytes;
    if (kind === 'background') this.#background++;
    if (kind === 'model') this.#models++;
    return { ok: true, token, reservedBytes: bytes };
  }
  /** Chamar apenas quando o trabalho terminou/filho fechou; timeout do chamador não é release. */
  release(token) {
    const entry = this.#leases.get(token);
    if (!entry) return false;
    this.#leases.delete(token); this.#reserved -= entry.bytes;
    if (entry.kind === 'background') this.#background--;
    if (entry.kind === 'model') this.#models--;
    return true;
  }
  stats() { return { active: this.#leases.size, reservedBytes: this.#reserved, background: this.#background, models: this.#models, blocked: this.#blocked, scope: 'single-coordinator', hardRssLimit: false }; }
}
