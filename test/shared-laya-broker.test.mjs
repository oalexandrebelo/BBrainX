import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SharedAdmission } from '../src/shared-admission.mjs';
import { SharedLayaBroker } from '../src/shared-laya-broker.mjs';
const H = c => c.repeat(64), questions = { q: { type: 'noul', instructions: 'Transport test only' } };
function setup(t, mode = 'normal') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-shared-laya-')), ledger = new SharedAdmission(home), brokers = [];
  ledger.registerResource({ id: 'neural', physicalKey: H('a'), slots: 1, byteLimit: 4096 });
  const broker = (scope = 'b', modeOverride = mode, overrides = {}) => {
    const x = new SharedLayaBroker({ home, resource: 'neural', scopeDigest: H(scope), reserveBytes: 1024,
      command: [process.execPath, fileURLToPath(new URL('./fixtures/serial-worker.mjs', import.meta.url)), modeOverride],
      startMs: 10000, deadlineMs: 2000, ...overrides }); brokers.push(x); return x;
  };
  t.after(async () => { for (const b of brokers) await b.close(); ledger.close(); fs.rmSync(home, { recursive: true, force: true }); });
  return { home, ledger, broker };
}
test('one resident worker is shared-budgeted even between decisions', async t => {
  const { ledger, broker } = setup(t), a = broker(), b = broker('c');
  assert((await a.decide(['one'], questions)).ok);
  assert.equal(ledger.inspect().resources[0].heldSlots, 1);
  assert.equal((await b.decide(['two'], questions)).reason, 'SHARED_SLOT_LIMIT');
  assert.equal(b.stats().transport.spawned, 0); assert.equal(a.stats().transport.spawned, 1);
  assert((await a.decide(['three'], questions)).ok); assert.equal(a.stats().transport.spawned, 1);
  assert.equal((await a.stop()).released, true); assert((await b.decide(['four'], questions)).ok);
});
test('worker timeout with observed close releases its reservation', async t => {
  const { ledger, broker } = setup(t), a = broker('b', 'hang-first');
  assert.equal((await a.decide(['one'], questions, { deadlineMs: 30 })).reason, 'TIMEOUT');
  assert.equal(a.stats().transport.processClosedObserved, true); assert.equal(ledger.inspect().resources[0].heldSlots, 0);
});
test('invalid transport input cannot leave a reserved slot without a process', async t => {
  const { ledger, broker } = setup(t), a = broker();
  assert.equal((await a.decide([], questions)).reason, 'INVALID_REQUEST');
  assert.equal(a.stats().transport.spawned, 0); assert.equal(ledger.inspect().resources[0].heldSlots, 0);
});
test('concurrent local calls do not acquire two reservations', async t => {
  const { ledger, broker } = setup(t, 'slow'), a = broker();
  const first = a.decide(['one'], questions); assert.equal((await a.decide(['two'], questions)).reason, 'BUSY');
  assert((await first).ok); assert.equal(ledger.inspect().issued, 1);
});
test('stop before scheduled acquisition does not leak a subsequently started worker', async t => {
  const { ledger, broker } = setup(t), a = broker();
  const pending = a.decide(['one'], questions), stop = a.stop();
  assert.equal((await pending).reason, 'SHARED_BROKER_CLOSED_OR_CLOSING'); assert.equal((await stop).released, true);
  assert.equal(a.stats().transport.spawned, 0); assert.equal(ledger.inspect().issued, 0);
});
test('simultaneous stop and decision drain the owned process before releasing capacity', async t => {
  const { ledger, broker } = setup(t, 'slow'), a = broker();
  const pending = a.decide(['one'], questions); await new Promise(r => setTimeout(r, 40));
  const stopped = await a.stop(); await pending;
  assert(stopped.released); assert(a.stats().transport.processClosedObserved); assert.equal(ledger.inspect().resources[0].heldSlots, 0);
});
test('unregistered resource refuses before starting a worker', async t => {
  const { broker } = setup(t), a = broker('b', 'normal', { resource: 'unregistered' });
  assert.equal((await a.decide(['one'], questions)).reason, 'RESOURCE_NOT_REGISTERED'); assert.equal(a.stats().transport.spawned, 0);
});
test('public broker stats never contain token or prompt', async t => {
  const { broker } = setup(t), a = broker(); await a.decide(['do-not-disclose-private-state'], questions);
  const data = JSON.stringify(a.stats()); assert(!data.includes('token')); assert(!data.includes('private-state'));
  await a.close(); assert.equal((await a.decide(['two'], questions)).reason, 'SHARED_BROKER_CLOSED_OR_CLOSING');
});

test('input and options are snapshotted before the first wrapper microtask', async t => {
  const { broker } = setup(t, 'normal'), a = broker(), states = ['original'], q = structuredClone(questions), options = { deadlineMs: 2000 };
  const work = a.decide(states, q, options); states.length = 0; delete q.q; options.deadlineMs = 0;
  assert.equal((await work).ok, true);
});
test('close fences new calls immediately rather than only after stopping the process', async t => {
  const { ledger, broker } = setup(t), a = broker(); await a.decide(['one'], questions);
  const closing = a.close(); assert.equal((await a.decide(['two'], questions)).reason, 'SHARED_BROKER_CLOSED_OR_CLOSING');
  await closing; assert.equal(ledger.inspect().resources[0].heldSlots, 0);
});

test('reservation release follows observed close when a descendant inherits stdout', async t => {
  const { ledger, broker } = setup(t), a = broker('b', 'normal', {
    command: [process.execPath, fileURLToPath(new URL('./fixtures/admission-delayed-close.mjs', import.meta.url))],
    shutdownMs: 100, graceMs: 50
  }), b = broker('c');
  assert((await a.decide(['one'], questions)).ok);
  const stopped=await a.stop(), observed=a.stats().transport.processClosedObserved;
  assert.equal(stopped.released, observed, 'capacity follows close evidence, never an exit code alone');
  // Windows can close its parent pipe before the descendant exits. POSIX retains the inherited descriptor.
  if(process.platform!=='win32')assert.equal(observed,false);
  if(!observed){
    assert.equal(ledger.inspect().reservations[0].state, 'unknown');
    assert.equal((await b.decide(['two'], questions)).reason, 'SHARED_SLOT_LIMIT');
  }else assert.equal(ledger.inspect().resources[0].heldSlots,0);
  // Aguarde o processo real fechar; timeout do teste é guarda, não prova de término.
  const deadline = performance.now() + 5000;
  while (!a.stats().transport.processClosedObserved && performance.now() < deadline) await new Promise(r => setTimeout(r, 10));
  assert(a.stats().transport.processClosedObserved);
  assert.equal((await a.stop()).released, true);
  assert.equal(ledger.inspect().resources[0].heldSlots, 0);
  assert((await b.decide(['three'], questions)).ok);
});
