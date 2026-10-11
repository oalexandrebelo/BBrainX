import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SharedAdmission, ADMISSION_FILE } from '../src/shared-admission.mjs';

const H = c => c.repeat(64), policy = { id: 'neural', physicalKey: H('a'), slots: 2, byteLimit: 100 };
const request = { resource: 'neural', scopeDigest: H('b'), requestDigest: H('c'), bytes: 20 };
const evidence = { expectedRevision: 1, evidenceDigest: H('d') };
function setup(t, options = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-admission-')), opened = [];
  const open = opts => { const db = new SharedAdmission(home, { ...options, ...opts }); opened.push(db); return db; };
  t.after(() => { for (const d of opened) d.close(); fs.rmSync(home, { recursive: true, force: true }); });
  const db = open(); db.registerResource(policy); return { home, db, open };
}
function resource(db) { return db.inspect().resources[0]; }
function direct(db) { const x = new DatabaseSync(db.location); x.exec('PRAGMA busy_timeout=1000;'); return x; }

test('independent handles share slots, bytes and persistent generation', t => {
  const { db, open } = setup(t), b = open(), a1 = db.acquire(request), a2 = b.acquire(request);
  assert(a1.ok && a2.ok); assert.equal(resource(db).heldSlots, 2); assert.equal(resource(b).heldBytes, 40);
  assert.deepEqual(db.acquire(request), { ok: false, reason: 'SHARED_SLOT_LIMIT' });
  db.release(a1.handle, evidence); b.release(a2.handle, evidence);
  assert.equal(resource(b).heldSlots, 0); assert.equal(db.acquire(request).handle.generation, 3);
});
test('bytes are a separate admission constraint from slots', t => {
  const { db } = setup(t); db.acquire({ ...request, bytes: 90 });
  assert.deepEqual(db.acquire(request), { ok: false, reason: 'SHARED_BYTE_LIMIT' });
  assert.equal(resource(db).heldSlots, 1); assert.equal(db.inspect().issued, 1);
});
test('same physical key cannot manufacture independent budgets with a second alias', t => {
  const { db } = setup(t); assert.throws(() => db.registerResource({ ...policy, id: 'another' }), { code: 'PHYSICAL_RESOURCE_ALREADY_BOUND' });
  assert.equal(db.inspect().resources.length, 1);
});
test('resource policy divergence is refused even after reservations are released', t => {
  const { db, open } = setup(t), b = open();
  assert.equal(b.registerResource(policy).duplicate, true);
  for (const changed of [{ slots: 3 }, { byteLimit: 101 }, { physicalKey: H('d') }])
    assert.throws(() => b.registerResource({ ...policy, ...changed }), { code: 'RESOURCE_POLICY_CONFLICT' });
});
test('closing a coordinator never frees reservations or recycles generations', t => {
  const { db, open } = setup(t), a = db.acquire(request); db.close(); const b = open();
  assert.equal(resource(b).heldSlots, 1); assert.equal(b.inspect().reservations[0].state, 'running');
  b.release(a.handle, evidence); assert.equal(b.acquire(request).handle.generation, 2);
});
test('unknown state consumes the original quota until verified reconciliation', t => {
  const { db } = setup(t), a = db.acquire({ ...request, bytes: 100 });
  const unknown = db.markUnknown(a.handle, { expectedRevision: 1, reason: 'timeout' });
  assert.equal(unknown.state, 'unknown'); assert.equal(resource(db).heldBytes, 100);
  assert.deepEqual(db.acquire(request), { ok: false, reason: 'SHARED_BYTE_LIMIT' });
  assert.throws(() => db.release(a.handle, { ...evidence, expectedRevision: 2 }), { code: 'RECONCILIATION_REQUIRED' });
});
test('ownership token, resource identity and ledger identity are mandatory', t => {
  const { db } = setup(t), a = db.acquire(request);
  for (const changed of [{ token: H('f') }, { ledgerId: 'a'.repeat(36) }, { resource: 'other' }, { generation: 999 }])
    assert.throws(() => db.release({ ...a.handle, ...changed }, evidence), { code: 'ADMISSION_OWNER_MISMATCH' });
  assert.equal(resource(db).heldSlots, 1);
});
test('old completion cannot release a new reservation; exact completion retry is idempotent', t => {
  const { db } = setup(t), a = db.acquire(request); db.release(a.handle, evidence);
  const b = db.acquire(request); assert(db.release(a.handle, evidence).duplicate);
  assert.equal(resource(db).heldSlots, 1); assert.equal(db.inspect().reservations[0].generation, b.handle.generation);
  assert.throws(() => db.release(a.handle, { ...evidence, evidenceDigest: H('e') }), { code: 'ADMISSION_REVISION_CONFLICT' });
});
test('uncertainty retry is idempotent and cannot rewrite the cause', t => {
  const { db } = setup(t), a = db.acquire(request), mark = { expectedRevision: 1, reason: 'transport-lost' };
  assert.equal(db.markUnknown(a.handle, mark).duplicate, false); assert.equal(db.markUnknown(a.handle, mark).duplicate, true);
  assert.throws(() => db.markUnknown(a.handle, { ...mark, reason: 'timeout' }), { code: 'ADMISSION_REVISION_CONFLICT' });
});
test('no verifier means no reconciliation, even with a well-formed evidence hash', t => {
  const { db } = setup(t), a = db.acquire(request);
  assert.throws(() => db.reconcile({ ledgerId: db.ledgerId, generation: a.handle.generation, expectedRevision: 1, kind: 'owned-process-closed', evidenceDigest: H('d') }), { code: 'RECONCILIATION_NOT_AUTHORIZED' });
});
test('host verifier permits explicit reconciliation after unknown, including exact retry', t => {
  let observed = false;
  const { db } = setup(t, { reconcileVerifier: (row, proof) => observed && row.resource === 'neural' && proof.evidenceDigest === H('d') });
  const a = db.acquire(request); db.markUnknown(a.handle, { expectedRevision: 1, reason: 'owner-interrupted' });
  const proof = { ledgerId: db.ledgerId, generation: a.handle.generation, expectedRevision: 2, kind: 'owned-process-closed', evidenceDigest: H('d') };
  assert.throws(() => db.reconcile(proof), { code: 'RECONCILIATION_EVIDENCE_REJECTED' });
  observed = true; assert.equal(db.reconcile(proof).state, 'released'); assert.equal(resource(db).heldSlots, 0);
  assert(db.reconcile(proof).duplicate);
});
test('verifier runs outside the write transaction; a concurrent transition invalidates its revision', t => {
  let other, handle;
  const { db, open } = setup(t, { reconcileVerifier: () => { other.markUnknown(handle, { expectedRevision: 1, reason: 'timeout' }); return true; } });
  other = open({ reconcileVerifier: undefined }); handle = db.acquire(request).handle;
  assert.throws(() => db.reconcile({ ledgerId: db.ledgerId, generation: handle.generation, expectedRevision: 1, kind: 'owned-process-closed', evidenceDigest: H('d') }), { code: 'ADMISSION_REVISION_CONFLICT' });
  assert.equal(resource(db).heldSlots, 1);
});
test('async or truthy verifier results never authorize release', async t => {
  const { db, open } = setup(t), a = db.acquire(request);
  assert.throws(() => open({ reconcileVerifier: async () => true }), { code: 'INVALID_RECONCILIATION_VERIFIER' });
  for (const reconcileVerifier of [() => ({}), () => Promise.reject(new Error('late refusal'))]) {
    const x = open({ reconcileVerifier });
    assert.throws(() => x.reconcile({ ledgerId: db.ledgerId, generation: a.handle.generation, expectedRevision: 1, kind: 'owned-process-closed', evidenceDigest: H('d') }), { code: 'RECONCILIATION_EVIDENCE_REJECTED' });
  }
  await new Promise(r => setImmediate(r)); assert.equal(resource(db).heldSlots, 1);
});
test('evidence event failure rolls back counter, sequence and reservation atomically', t => {
  const { db } = setup(t), x = direct(db);
  try {
    x.exec("CREATE TRIGGER fail_event BEFORE INSERT ON admission_events BEGIN SELECT RAISE(ABORT,'injected event fault'); END;");
    assert.throws(() => db.acquire(request), /injected event fault/);
    assert.equal(db.inspect().issued, 0); assert.equal(resource(db).heldSlots, 0);
    x.exec('DROP TRIGGER fail_event'); assert.equal(db.acquire(request).handle.generation, 1);
  } finally { x.close(); }
});
test('failed release retains the running reservation and counters', t => {
  const { db } = setup(t), a = db.acquire(request), x = direct(db);
  try {
    x.exec("CREATE TRIGGER fail_event BEFORE INSERT ON admission_events WHEN NEW.transition='complete' BEGIN SELECT RAISE(ABORT,'release fault'); END;");
    assert.throws(() => db.release(a.handle, evidence), /release fault/);
    assert.equal(resource(db).heldSlots, 1); assert.equal(db.inspect().reservations[0].state, 'running');
    x.exec('DROP TRIGGER fail_event'); db.release(a.handle, evidence); assert.equal(resource(db).heldSlots, 0);
  } finally { x.close(); }
});
test('busy writer is refused rather than losing a reservation or entering an unbounded retry loop', t => {
  const { db, open } = setup(t), b = open({ busyTimeoutMs: 10 }), x = direct(db);
  try { x.exec('BEGIN IMMEDIATE'); assert.throws(() => b.acquire(request), { code: 'ADMISSION_BUSY' }); x.exec('ROLLBACK'); assert.equal(db.inspect().issued, 0); }
  finally { x.close(); }
});
test('history is bounded and remains explicit after closing/reopening', t => {
  const { db, open } = setup(t, { historyLimit: 2 });
  for (let i = 0; i < 2; i++) db.release(db.acquire(request).handle, evidence);
  assert.deepEqual(open().acquire(request), { ok: false, reason: 'ADMISSION_HISTORY_LIMIT' });
  assert.throws(() => open({ historyLimit: 3 }), { code: 'ADMISSION_CONFIGURATION_CONFLICT' });
});
test('read-only observer cannot mutate and never discloses tokens or token hashes', t => {
  const { db, open } = setup(t), a = db.acquire(request), r = open({ readOnly: true });
  assert.throws(() => r.release(a.handle, evidence), { code: 'ADMISSION_READ_ONLY' });
  const text = JSON.stringify(r.inspect()); assert(!text.includes(a.handle.token)); assert(!text.includes('token_hash')); assert.equal(resource(r).heldSlots, 1);
});
test('future schema or a dropped index is refused, not repaired', t => {
  const { db, open } = setup(t), x = direct(db);
  try {
    x.exec('PRAGMA user_version=2'); assert.throws(() => open(), { code: 'ADMISSION_SCHEMA_MISMATCH' });
    assert.equal(x.prepare('PRAGMA user_version').get().user_version, 2);
    x.exec('PRAGMA user_version=1; DROP INDEX admission_active'); assert.throws(() => open(), { code: 'ADMISSION_SCHEMA_MISMATCH' });
  } finally { x.close(); }
});
test('unrelated version-zero database is not initialized as an admission database', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-unrelated-')), directory = path.join(home, 'admission'); fs.mkdirSync(directory, { mode: 0o700 });
  const file = path.join(directory, ADMISSION_FILE), x = new DatabaseSync(file); fs.chmodSync(file, 0o600);
  x.exec('CREATE TABLE private_data(x TEXT); INSERT INTO private_data VALUES(\'preserve\')'); x.close();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  assert.throws(() => new SharedAdmission(home), { code: 'ADMISSION_SCHEMA_MISMATCH' });
  const check = new DatabaseSync(file); try { assert.equal(check.prepare('SELECT x FROM private_data').get().x, 'preserve'); } finally { check.close(); }
});
test('aggregate drift is rejected both on inspection and on reconnect', t => {
  const { db, open } = setup(t), x = direct(db); db.acquire(request);
  try { x.exec('UPDATE admission_resources SET held_slots=0,held_bytes=0'); assert.throws(() => db.inspect(), { code: 'ADMISSION_COUNTER_MISMATCH' }); assert.throws(() => open(), { code: 'ADMISSION_COUNTER_MISMATCH' }); }
  finally { x.close(); }
});
test('invalid field shapes cannot execute getters or store arbitrary plaintext', t => {
  const { db } = setup(t); let called = false;
  const getter = Object.defineProperty({}, 'resource', { enumerable: true, get() { called = true; return 'neural'; } });
  for (const arg of [getter, new Proxy({}, {}), { ...request, prompt: 'private' }, { ...request, bytes: NaN }, { ...request, bytes: 0 }, { ...request, scopeDigest: 'private plaintext' }]) assert.throws(() => db.acquire(arg));
  assert.equal(called, false); assert.equal(db.inspect().issued, 0);
});
test('pagination does not pretend all active reservations were returned', t => {
  const { db } = setup(t); db.acquire(request); db.acquire(request);
  const page = db.inspect({ limit: 1 }); assert.equal(page.reservations.length, 1); assert.equal(page.nextAfter, 1);
  const next = db.inspect({ after: page.nextAfter, limit: 1 }); assert.equal(next.reservations[0].generation, 2); assert.equal(next.nextAfter, null);
});
test('new schema is isolated: removing an unused profile does not change brain.sqlite bytes', t => {
  const { db, home, open } = setup(t), brain = path.join(home, 'brain.sqlite'); fs.writeFileSync(brain, 'untouched-authority-test-bytes');
  const before = fs.readFileSync(brain); db.close(); fs.rmSync(path.join(home, 'admission'), { recursive: true });
  const next = open(); assert.notEqual(next.ledgerId, db.ledgerId); assert.deepEqual(fs.readFileSync(brain), before);
});
test('an absent ledger in observer mode is not created and repeated close is safe', t => {
  const { db, home } = setup(t); db.close(); db.close();
  assert.throws(() => db.acquire(request), { code: 'ADMISSION_CLOSED' });
  const missing = path.join(home, 'missing'); assert.throws(() => new SharedAdmission(missing, { readOnly: true })); assert(!fs.existsSync(missing));
});

test('hard-linked database files are refused without modifying the linked target', t => {
  const { db, home } = setup(t), target = db.location, alias = path.join(home, 'linked.sqlite'); db.close();
  const before = fs.readFileSync(target); fs.linkSync(target, alias);
  assert.throws(() => new SharedAdmission(home), { code: 'UNSAFE_ADMISSION_FILE' }); assert.deepEqual(fs.readFileSync(alias), before);
});
