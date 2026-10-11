import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { SharedAdmission } from '../src/shared-admission.mjs';
import { ResourceAdmission } from '../src/resource-admission.mjs';
const H = c => c.repeat(64);
function fixture(t, slots = 1, byteLimit = 100) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-admission-ipc-')), children = [], ledgers = [];
  const open = options => { const d = new SharedAdmission(home, { busyTimeoutMs: 5000, ...options }); ledgers.push(d); return d; };
  const db = open(); db.registerResource({ id: 'neural', physicalKey: H('a'), slots, byteLimit });
  t.after(async () => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close'); child.kill('SIGKILL'); await closed;
    }
    for (const d of ledgers) d.close(); fs.rmSync(home, { recursive: true, force: true });
  });
  async function client(name) {
    const c = fork(fileURLToPath(new URL('./fixtures/admission-process.mjs', import.meta.url)), [home, 'hold', name],
      { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [] }); children.push(c);
    let errors = ''; c.stderr.on('data', x => { errors += x; });
    await message(c, 'ready'); return c;
  }
  return { db, open, client, home, children };
}
function message(child, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('IPC_DEADLINE:' + event)), 15000);
    const cleanup = () => { clearTimeout(timeout); child.off('message', onMessage); child.off('error', onError); child.off('exit', onExit); };
    const finish = (error, value) => { cleanup(); error ? reject(error) : resolve(value); };
    const onError = e => finish(e), onExit = (code, signal) => finish(new Error(`CHILD_EXIT:${code}:${signal}:${event}`));
    const onMessage = data => { if (data.event === 'error') finish(new Error(data.code)); else if (data.event === event) finish(null, data); };
    child.on('message', onMessage); child.once('error', onError); child.once('exit', onExit);
  });
}
async function send(child, command, event, options = {}) { const wait = message(child, event); child.send({ command, ...options }); return wait; }

for (const [count, slots] of [[2, 1], [8, 2]]) test(`${count} real processes synchronize acquisition against ${slots} global slots`, async t => {
  const { db, client } = fixture(t, slots), clients = await Promise.all(Array.from({ length: count }, (_, i) => client('lane-' + i)));
  const results = await Promise.all(clients.map(c => send(c, 'acquire', 'acquired')));
  assert.equal(results.filter(r => r.result.ok).length, slots);
  assert(results.filter(r => !r.result.ok).every(r => r.result.reason === 'SHARED_SLOT_LIMIT'));
  assert(results.every(r => r.observed.heldSlots <= slots)); assert.equal(db.inspect().resources[0].heldSlots, slots);
  await Promise.all(clients.filter((_, i) => results[i].result.ok).map(c => send(c, 'release', 'released')));
  assert.equal(db.inspect().resources[0].heldSlots, 0); assert.equal(db.inspect().resources[0].heldBytes, 0);
});
test('cross-process byte exhaustion is not replaced by a slot-only check', async t => {
  const { db, client } = fixture(t, 8, 39), clients = await Promise.all([client('a'), client('b')]);
  const results = await Promise.all(clients.map(c => send(c, 'acquire', 'acquired')));
  assert.equal(results.filter(r => r.result.ok).length, 1);
  assert.equal(results.find(r => !r.result.ok).result.reason, 'SHARED_BYTE_LIMIT'); assert.equal(db.inspect().resources[0].heldBytes, 20);
});
test('SIGKILL after COMMIT retains uncertain capacity; observed close permits host reconciliation', async t => {
  const { db, client, open } = fixture(t), a = await client('a');
  const acquired = await send(a, 'acquire', 'acquired'); assert(acquired.result.ok);
  const closed = once(a, 'close'); a.kill('SIGKILL'); await closed;
  // Filho teste possui toda a tarefa. Em inferência remota, encerrar este cliente não provaria fim do servidor.
  const b = open(); assert.equal(b.inspect().resources[0].heldSlots, 1);
  assert.equal(b.acquire({ resource: 'neural', bytes: 1, scopeDigest: H('b'), requestDigest: H('c') }).reason, 'SHARED_SLOT_LIMIT');
  const admin = open({ reconcileVerifier: (row, proof) => a.exitCode !== null || a.signalCode !== null });
  const result = admin.reconcile({ ledgerId: db.ledgerId, generation: acquired.result.handle.generation, expectedRevision: 1, kind: 'owned-process-closed', evidenceDigest: H('d') });
  assert.equal(result.state, 'released'); assert.equal(b.inspect().resources[0].heldSlots, 0);
  const next = b.acquire({ resource: 'neural', bytes: 1, scopeDigest: H('b'), requestDigest: H('c') });
  assert(next.ok); assert(next.handle.generation > acquired.result.handle.generation);
});
test('SIGKILL before COMMIT rolls back the real SQLite writer', async t => {
  const { db, client, open } = fixture(t), a = await client('uncommitted');
  await send(a, 'begin-uncommitted', 'uncommitted');
  const closed = once(a, 'close'); a.kill('SIGKILL'); await closed;
  const b = open(); assert.equal(b.inspect().resources[0].heldSlots, 0); assert.equal(db.inspect().issued, 0);
});
test('eight producers repeatedly acquire/release without counter drift under contention', async t => {
  const { db, client } = fixture(t, 3, 3), clients = await Promise.all(Array.from({ length: 8 }, (_, i) => client('producer-' + i)));
  const results = await Promise.all(clients.map(c => send(c, 'cycle', 'cycled', { count: 100 })));
  assert.equal(results.reduce((n, r) => n + r.accepted + r.refused, 0), 800);
  assert(results.every(r => r.maximum <= 3)); assert(results.reduce((n, r) => n + r.accepted, 0) > 0);
  assert.equal(db.inspect().resources[0].heldSlots, 0); assert.equal(db.inspect().resources[0].heldBytes, 0);
});
test('counterexample: two process-local coordinators admit two models despite a per-object limit of one', () => {
  const a = new ResourceAdmission({ clock: () => 100 }), b = new ResourceAdmission({ clock: () => 100 });
  const sample = { availableBytes: 16 * 1024 ** 3, observedAtMs: 100, thermal: 'nominal', onBattery: false };
  a.observe(sample); b.observe(sample);
  assert(a.acquire({ bytes: 1024, kind: 'model', consent: true }).ok);
  assert(b.acquire({ bytes: 1024, kind: 'model', consent: true }).ok);
  assert.equal(a.stats().models + b.stats().models, 2);
  // Contraprova de escopo do mecanismo antigo, não alegação de violação de seu contrato single-coordinator.
});

test('two actual broker processes cannot load two residents in a one-slot shared profile', async t => {
  const { db, home, children } = fixture(t);
  for (const scope of ['b', 'c']) {
    const c = fork(fileURLToPath(new URL('./fixtures/shared-laya-process.mjs', import.meta.url)), [home, scope], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] });
    children.push(c); await message(c, 'ready');
  }
  const results = await Promise.all(children.map(c => send(c, 'decide', 'decided')));
  assert.equal(results.filter(r => r.result.ok).length, 1);
  const winner = results.findIndex(r => r.result.ok), other = 1 - winner;
  assert.equal(results[other].result.reason, 'SHARED_SLOT_LIMIT'); assert.equal(results[other].stats.transport.spawned, 0);
  assert.equal(db.inspect().resources[0].heldSlots, 1);
  await send(children[winner], 'stop', 'stopped');
  assert((await send(children[other], 'decide', 'decided')).result.ok);
  await send(children[other], 'stop', 'stopped'); assert.equal(db.inspect().resources[0].heldSlots, 0);
  // Fechar antes de remover o diretório; Windows não permite unlink de bancos ainda abertos.
  await Promise.all(children.map(async child => {
    const closed = once(child, 'close');
    child.send({ command: 'close' });
    await closed;
  }));
});
