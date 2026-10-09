import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { types } from 'node:util';

/** @typedef {{ledgerId:string,resource:string,generation:number,token:string}} AdmissionHandle */
/** @typedef {{id:string,physicalKey:string,slots:number,byteLimit:number}} ResourcePolicy */
export class AdmissionError extends Error {
  constructor(code) { super(code); this.name = 'AdmissionError'; this.code = code; }
}
const need = (ok, code) => { if (!ok) throw new AdmissionError(code); };
const digest = value => createHash('sha256').update(value).digest('hex');
const positive = (n, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= 1 && n <= max;
const hex = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const label = s => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(s);
const uuid = s => typeof s === 'string' && /^[a-f0-9-]{36}$/.test(s);
const UNKNOWN_REASONS = new Set(['timeout', 'transport-lost', 'owner-interrupted', 'close-unconfirmed']);
const PROOF_KINDS = new Set(['owned-process-closed', 'operator-confirmed-quiescence']);
export const ADMISSION_FILE = 'admission-v1.sqlite';
const APPLICATION_ID = 1111642436; // BBAD; banco separado de brain.sqlite e do registro de lanes.

// Apenas dados do host/JSON. Ler um contrato não deve executar getters ou traps.
function record(value, required, optional = []) {
  need(value !== null && typeof value === 'object' && !types.isProxy(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'INVALID_ADMISSION_ARGUMENT');
  const fields = Object.getOwnPropertyDescriptors(value);
  need(Reflect.ownKeys(fields).every(k => typeof k === 'string' && (required.includes(k) || optional.includes(k)) &&
    fields[k].enumerable && 'value' in fields[k]), 'INVALID_ADMISSION_ARGUMENT');
  need(required.every(k => Object.hasOwn(fields, k)), 'INVALID_ADMISSION_ARGUMENT');
  return Object.fromEntries(Object.entries(fields).map(([k, d]) => [k, d.value]));
}

const SCHEMA = `
CREATE TABLE admission_control (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 ledger_id TEXT NOT NULL UNIQUE,
 issued INTEGER NOT NULL CHECK(issued>=0 AND issued<=1000000),
 history_limit INTEGER NOT NULL CHECK(history_limit>=1 AND history_limit<=1000000)
) STRICT;
CREATE TABLE admission_resources (
 id TEXT PRIMARY KEY, physical_key TEXT NOT NULL UNIQUE,
 slots INTEGER NOT NULL CHECK(slots BETWEEN 1 AND 64),
 byte_limit INTEGER NOT NULL CHECK(byte_limit BETWEEN 1 AND 8796093022208),
 held_slots INTEGER NOT NULL DEFAULT 0 CHECK(held_slots>=0 AND held_slots<=slots),
 held_bytes INTEGER NOT NULL DEFAULT 0 CHECK(held_bytes>=0 AND held_bytes<=byte_limit)
) STRICT;
CREATE TABLE admission_reservations (
 generation INTEGER PRIMARY KEY,
 resource_id TEXT NOT NULL REFERENCES admission_resources(id),
 token_hash TEXT NOT NULL UNIQUE, scope_digest TEXT NOT NULL, request_digest TEXT NOT NULL,
 bytes INTEGER NOT NULL CHECK(bytes>0),
 state TEXT NOT NULL CHECK(state IN ('running','unknown','released')),
 revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 3),
 transition TEXT NOT NULL CHECK(transition IN ('acquire','uncertain','complete','reconcile')),
 reason TEXT, evidence_digest TEXT,
 created TEXT NOT NULL, updated TEXT NOT NULL
) STRICT;
CREATE INDEX admission_active ON admission_reservations(resource_id,generation) WHERE state IN ('running','unknown');
CREATE TABLE admission_events (
 generation INTEGER NOT NULL REFERENCES admission_reservations(generation),
 revision INTEGER NOT NULL, state TEXT NOT NULL, transition TEXT NOT NULL,
 reason TEXT, evidence_digest TEXT, created TEXT NOT NULL,
 PRIMARY KEY(generation,revision)
) STRICT;
`;
const schemaRows = db => db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
const expectedSchema = (() => {
  const db = new DatabaseSync(':memory:');
  try { db.exec(SCHEMA); return digest(JSON.stringify(schemaRows(db))); } finally { db.close(); }
})();
const PUBLIC_COLUMNS = 'generation,resource_id AS resource,scope_digest AS scopeDigest,request_digest AS requestDigest,bytes,state,revision,transition,reason,evidence_digest AS evidenceDigest,created,updated';

function privateDirectory(directory, create) {
  if (create) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  need(stat.isDirectory() && !stat.isSymbolicLink(), 'UNSAFE_ADMISSION_DIRECTORY');
  if (process.platform !== 'win32') need(stat.uid === process.getuid() && (stat.mode & 0o077) === 0, 'UNSAFE_ADMISSION_DIRECTORY');
  return fs.realpathSync(directory);
}
function regularFile(file) {
  const stat = fs.lstatSync(file);
  need(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, 'UNSAFE_ADMISSION_FILE');
  if (process.platform !== 'win32') need(stat.uid === process.getuid() && (stat.mode & 0o077) === 0, 'UNSAFE_ADMISSION_FILE');
}

/** Autoridade cooperativa por BBRAINX_HOME. Não é sandbox, cgroup, fila distribuída ou autorização.
 * Todas as mutações usam uma transação curta; nenhuma espera de modelo/rede ocorre com writer retido.
 * O token é uma capacidade do host: nunca publicá-lo em logs, tools ou métricas.
 */
export class SharedAdmission {
  #db; #statements = new Map(); #closed = false; #readOnly; #reconcileVerifier; #ledgerId;
  constructor(home, options = {}) {
    const config = record(options, [], ['readOnly', 'historyLimit', 'busyTimeoutMs', 'reconcileVerifier']);
    const { readOnly = false, historyLimit = 100000, busyTimeoutMs = 1000, reconcileVerifier } = config;
    need(typeof home === 'string' && path.isAbsolute(home) && !home.includes('\0'), 'INVALID_ADMISSION_HOME');
    need(typeof readOnly === 'boolean' && positive(historyLimit, 1000000) && positive(busyTimeoutMs, 5000), 'INVALID_ADMISSION_CONFIGURATION');
    need(reconcileVerifier === undefined || typeof reconcileVerifier === 'function' && !types.isAsyncFunction(reconcileVerifier), 'INVALID_RECONCILIATION_VERIFIER');
    this.#readOnly = readOnly; this.#reconcileVerifier = reconcileVerifier;
    if (!readOnly) fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    need(!fs.lstatSync(home).isSymbolicLink(), 'UNSAFE_ADMISSION_HOME');
    const directory = privateDirectory(path.join(fs.realpathSync(home), 'admission'), !readOnly);
    const file = path.join(directory, ADMISSION_FILE);
    if (!readOnly) {
      try { fs.closeSync(fs.openSync(file, 'wx', 0o600)); }
      catch (e) { if (e.code !== 'EEXIST') throw e; }
    }
    regularFile(file);
    for (const suffix of ['-wal', '-shm']) {
      try { fs.lstatSync(file + suffix); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      regularFile(file + suffix); // Inclui links pendentes; existsSync os ocultaria.
    }
    this.#db = new DatabaseSync(file, { readOnly, allowExtension: false });
    try {
      this.#db.exec(`PRAGMA busy_timeout=${busyTimeoutMs}; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;`);
      // Banco desconhecido não recebe DDL, mudança de journal ou tentativa de "reparo".
      const version = this.#db.prepare('PRAGMA user_version').get().user_version;
      if (version === 0) {
        need(!readOnly, 'ADMISSION_NOT_INITIALIZED');
        this.#transaction(() => {
          if (this.#db.prepare('PRAGMA user_version').get().user_version === 0) {
            need(schemaRows(this.#db).length === 0, 'ADMISSION_SCHEMA_MISMATCH');
            this.#db.exec(SCHEMA);
            this.#db.prepare('INSERT INTO admission_control VALUES(1,?,0,?)').run(randomUUID(), historyLimit);
            this.#db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=1;`);
          }
        });
      }
      this.#db.exec('BEGIN DEFERRED');
      try {
        need(this.#db.prepare('PRAGMA user_version').get().user_version === 1 &&
          this.#db.prepare('PRAGMA application_id').get().application_id === APPLICATION_ID &&
          digest(JSON.stringify(schemaRows(this.#db))) === expectedSchema, 'ADMISSION_SCHEMA_MISMATCH');
        const control = this.#db.prepare('SELECT * FROM admission_control WHERE singleton=1').get();
        need(control && uuid(control.ledger_id) && control.history_limit === historyLimit, 'ADMISSION_CONFIGURATION_CONFLICT');
        this.#ledgerId = control.ledger_id;
        this.#checkTotals(); this.#db.exec('COMMIT');
      } catch (e) { try { this.#db.exec('ROLLBACK'); } catch {} throw e; }
      if (!readOnly) {
        need(this.#db.prepare('PRAGMA journal_mode=WAL').get().journal_mode === 'wal', 'ADMISSION_WAL_REQUIRED');
        this.#db.exec('PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=1000;');
      }
      Object.defineProperties(this, {
        ledgerId: { value: this.#ledgerId, enumerable: true },
        location: { value: file, enumerable: true },
        historyLimit: { value: historyLimit, enumerable: true }
      });
    } catch (e) { this.#db.close(); this.#closed = true; throw e; }
  }
  #statement(sql) {
    need(!this.#closed, 'ADMISSION_CLOSED');
    if (!this.#statements.has(sql)) this.#statements.set(sql, this.#db.prepare(sql));
    return this.#statements.get(sql);
  }
  #transaction(fn) {
    need(!this.#closed && !this.#readOnly, this.#closed ? 'ADMISSION_CLOSED' : 'ADMISSION_READ_ONLY');
    let begun = false;
    try {
      this.#db.exec('BEGIN IMMEDIATE'); begun = true;
      const result = fn(); this.#db.exec('COMMIT'); return result;
    } catch (e) {
      if (begun) { try { this.#db.exec('ROLLBACK'); } catch {} }
      if (e.errcode === 5 || e.errcode === 6) throw new AdmissionError('ADMISSION_BUSY');
      throw e;
    }
  }
  #checkTotals() {
    const mismatch = this.#db.prepare(`SELECT r.id FROM admission_resources r LEFT JOIN
      (SELECT resource_id,count(*) AS slots,sum(bytes) AS bytes FROM admission_reservations
       WHERE state IN ('running','unknown') GROUP BY resource_id) a ON a.resource_id=r.id
       WHERE r.held_slots<>coalesce(a.slots,0) OR r.held_bytes<>coalesce(a.bytes,0) LIMIT 1`).get();
    need(!mismatch, 'ADMISSION_COUNTER_MISMATCH');
  }
  #row(generation) { return this.#statement(`SELECT ${PUBLIC_COLUMNS} FROM admission_reservations WHERE generation=?`).get(generation); }
  #owner(handle) {
    const h = record(handle, ['ledgerId', 'resource', 'generation', 'token']);
    need(h.ledgerId === this.#ledgerId && label(h.resource) && positive(h.generation) && hex(h.token), 'ADMISSION_OWNER_MISMATCH');
    const row = this.#statement('SELECT token_hash,resource_id FROM admission_reservations WHERE generation=?').get(h.generation);
    need(row && row.resource_id === h.resource && timingSafeEqual(Buffer.from(row.token_hash, 'hex'), Buffer.from(digest(h.token), 'hex')), 'ADMISSION_OWNER_MISMATCH');
    return this.#row(h.generation);
  }
  #event(row) {
    this.#statement('INSERT INTO admission_events VALUES(?,?,?,?,?,?,?)').run(
      row.generation, row.revision, row.state, row.transition, row.reason, row.evidenceDigest, row.updated);
  }
  registerResource(policy) {
    const p = record(policy, ['id', 'physicalKey', 'slots', 'byteLimit']);
    need(label(p.id) && hex(p.physicalKey) && positive(p.slots, 64) && positive(p.byteLimit, 8 * 1024 ** 4), 'INVALID_RESOURCE_POLICY');
    return this.#transaction(() => {
      const old = this.#statement('SELECT * FROM admission_resources WHERE id=?').get(p.id);
      if (old) {
        need(old.physical_key === p.physicalKey && old.slots === p.slots && old.byte_limit === p.byteLimit, 'RESOURCE_POLICY_CONFLICT');
        return { id: p.id, duplicate: true };
      }
      need(!this.#statement('SELECT id FROM admission_resources WHERE physical_key=?').get(p.physicalKey), 'PHYSICAL_RESOURCE_ALREADY_BOUND');
      need(this.#statement('SELECT count(*) AS n FROM admission_resources').get().n < 128, 'RESOURCE_RETENTION_LIMIT');
      this.#statement('INSERT INTO admission_resources(id,physical_key,slots,byte_limit) VALUES(?,?,?,?)').run(p.id, p.physicalKey, p.slots, p.byteLimit);
      return { id: p.id, duplicate: false };
    });
  }
  acquire(input) {
    const { resource, scopeDigest, requestDigest, bytes } = record(input, ['resource', 'scopeDigest', 'requestDigest', 'bytes']);
    need(label(resource) && hex(scopeDigest) && hex(requestDigest) && positive(bytes, 8 * 1024 ** 4), 'INVALID_ADMISSION_REQUEST');
    return this.#transaction(() => {
      const r = this.#statement('SELECT * FROM admission_resources WHERE id=?').get(resource);
      need(r, 'RESOURCE_NOT_REGISTERED');
      if (r.held_slots >= r.slots) return { ok: false, reason: 'SHARED_SLOT_LIMIT' };
      if (bytes > r.byte_limit - r.held_bytes) return { ok: false, reason: 'SHARED_BYTE_LIMIT' };
      const c = this.#statement('SELECT issued,history_limit FROM admission_control WHERE singleton=1').get();
      if (c.issued >= c.history_limit) return { ok: false, reason: 'ADMISSION_HISTORY_LIMIT' };
      const generation = c.issued + 1, token = randomBytes(32).toString('hex'), time = new Date().toISOString();
      this.#statement('UPDATE admission_control SET issued=? WHERE singleton=1').run(generation);
      this.#statement('UPDATE admission_resources SET held_slots=held_slots+1,held_bytes=held_bytes+? WHERE id=?').run(bytes, resource);
      this.#statement(`INSERT INTO admission_reservations VALUES(?,?,?,?,?,?,'running',1,'acquire',NULL,NULL,?,?)`).run(
        generation, resource, digest(token), scopeDigest, requestDigest, bytes, time, time);
      const row = this.#row(generation); this.#event(row);
      return { ok: true, handle: Object.freeze({ ledgerId: this.#ledgerId, resource, generation, token }), reservation: row };
    });
  }
  markUnknown(handle, input) {
    const { expectedRevision, reason } = record(input, ['expectedRevision', 'reason']);
    need(positive(expectedRevision, 3) && UNKNOWN_REASONS.has(reason), 'INVALID_UNCERTAINTY');
    return this.#transaction(() => {
      const row = this.#owner(handle);
      if (row.state === 'unknown' && row.revision === expectedRevision + 1 && row.reason === reason) return { ...row, duplicate: true };
      need(row.revision === expectedRevision, 'ADMISSION_REVISION_CONFLICT');
      need(row.state === 'running', 'INVALID_ADMISSION_TRANSITION');
      this.#statement("UPDATE admission_reservations SET state='unknown',revision=revision+1,transition='uncertain',reason=?,updated=? WHERE generation=?").run(reason, new Date().toISOString(), row.generation);
      const updated = this.#row(row.generation); this.#event(updated); return { ...updated, duplicate: false };
    });
  }
  #release(row, expectedRevision, transition, reason, evidenceDigest) {
    need(row, 'RESERVATION_NOT_FOUND');
    if (row.state === 'released' && row.revision === expectedRevision + 1 && row.transition === transition && row.reason === reason && row.evidenceDigest === evidenceDigest) return { ...row, duplicate: true };
    need(row.revision === expectedRevision, 'ADMISSION_REVISION_CONFLICT');
    need(row.state === 'running' || transition === 'reconcile' && row.state === 'unknown', 'RECONCILIATION_REQUIRED');
    this.#statement("UPDATE admission_reservations SET state='released',revision=revision+1,transition=?,reason=?,evidence_digest=?,updated=? WHERE generation=?").run(transition, reason, evidenceDigest, new Date().toISOString(), row.generation);
    const changed = this.#statement('UPDATE admission_resources SET held_slots=held_slots-1,held_bytes=held_bytes-? WHERE id=? AND held_slots>=1 AND held_bytes>=?').run(row.bytes, row.resource, row.bytes);
    need(changed.changes === 1, 'ADMISSION_COUNTER_MISMATCH');
    const updated = this.#row(row.generation); this.#event(updated); return { ...updated, duplicate: false };
  }
  /** Só o executor pode afirmar conclusão; este digest não autentica a observação por si só. */
  release(handle, input) {
    const { expectedRevision, evidenceDigest } = record(input, ['expectedRevision', 'evidenceDigest']);
    need(positive(expectedRevision, 3) && hex(evidenceDigest), 'INVALID_COMPLETION_EVIDENCE');
    return this.#transaction(() => this.#release(this.#owner(handle), expectedRevision, 'complete', null, evidenceDigest));
  }
  /** Verificador é código confiável do host, não parâmetro de ferramenta nem score de modelo.
   * Corre fora do writer; a transação posterior revalida a revisão para evitar TOCTOU.
   */
  reconcile(input) {
    const { ledgerId, generation, expectedRevision, kind, evidenceDigest } = record(input, ['ledgerId', 'generation', 'expectedRevision', 'kind', 'evidenceDigest']);
    need(ledgerId === this.#ledgerId && positive(generation) && positive(expectedRevision, 3) && PROOF_KINDS.has(kind) && hex(evidenceDigest), 'INVALID_RECONCILIATION');
    need(this.#reconcileVerifier, 'RECONCILIATION_NOT_AUTHORIZED');
    const row = this.#row(generation); need(row, 'RESERVATION_NOT_FOUND');
    const accepted = this.#reconcileVerifier(Object.freeze({ ...row, ledgerId }), Object.freeze({ kind, evidenceDigest }));
    // Um thenable acidental não vira aprovação. Promessas rejeitadas permanecem observadas.
    if (accepted && typeof accepted.then === 'function') Promise.resolve(accepted).catch(() => {});
    need(accepted === true, 'RECONCILIATION_EVIDENCE_REJECTED');
    return this.#transaction(() => this.#release(this.#row(generation), expectedRevision, 'reconcile', kind, evidenceDigest));
  }
  inspect({ after = 0, limit = 100 } = {}) {
    need(Number.isSafeInteger(after) && after >= 0 && positive(limit, 200) && !this.#closed, 'INVALID_ADMISSION_QUERY');
    this.#db.exec('BEGIN DEFERRED');
    try {
      this.#checkTotals();
      const control = this.#statement('SELECT issued,history_limit AS historyLimit FROM admission_control WHERE singleton=1').get();
      const resources = this.#statement('SELECT id,physical_key AS physicalKey,slots,byte_limit AS byteLimit,held_slots AS heldSlots,held_bytes AS heldBytes FROM admission_resources ORDER BY id').all();
      const rows = this.#statement(`SELECT ${PUBLIC_COLUMNS} FROM admission_reservations WHERE state IN ('running','unknown') AND generation>? ORDER BY generation LIMIT ?`).all(after, limit + 1);
      this.#db.exec('COMMIT');
      return { ledgerId: this.#ledgerId, ...control, resources, reservations: rows.slice(0, limit),
        nextAfter: rows.length > limit ? rows[limit - 1].generation : null, scope: 'cooperating-processes-on-one-local-host', hardRssLimit: false };
    } catch (e) { try { this.#db.exec('ROLLBACK'); } catch {} throw e; }
  }
  close() {
    if (this.#closed) return;
    this.#statements.clear(); this.#db.close(); this.#closed = true;
    // Intencional: fechar conexão não comprova término do trabalho nem devolve reservas.
  }
}
