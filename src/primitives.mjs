import { createHash, randomUUID } from 'node:crypto';

export class BrainError extends Error {
  constructor(code, detail = code) { super(detail); this.name = 'BrainError'; this.code = code; }
}
export function ensure(condition, code, detail) { if (!condition) throw new BrainError(code, detail); }
export function identifier(value) {
  ensure(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value), 'INVALID_ID');
  return value;
}
export function text(value, max = 16000) {
  ensure(typeof value === 'string' && value.trim().length > 0 && value.length <= max, 'INVALID_TEXT');
  return value;
}
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  ensure(value !== undefined && !(typeof value === 'number' && !Number.isFinite(value)), 'INVALID_JSON');
  return JSON.stringify(value);
}
export function hash(value) { return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex'); }
export const now = () => new Date().toISOString();
export const newId = () => randomUUID();

/** Uma leitura compartilhada; nunca usar esta classe para mutações. */
export class SingleFlight {
  #pending = new Map();
  run(key, read) {
    if (this.#pending.has(key)) return this.#pending.get(key);
    const promise = Promise.resolve().then(read).finally(() => this.#pending.delete(key));
    this.#pending.set(key, promise);
    return promise;
  }
}
