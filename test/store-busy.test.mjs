import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BrainStore } from '../src/store.mjs';
import { makeEngine } from '../src/engine.mjs';
const principal = { principal: { id: 'host' } };
function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-busy-')), work = path.join(home, 'work'); fs.mkdirSync(work);
  const store = new BrainStore(home); store.register('p', work);
  const other = new DatabaseSync(path.join(home, 'brain.sqlite'));
  t.after(() => { try { other.exec('ROLLBACK'); } catch { /* not in a transaction */ } other.close(); store.close(); fs.rmSync(home, { recursive: true, force: true }); });
  store.db.exec('PRAGMA busy_timeout=1'); // the competing writer below is another connection, as another process would be
  return { store, other, engine: makeEngine(store, ['p']) };
}
test('a write blocked by another process is a typed, retryable STORE_BUSY, not an opaque EXECUTION_FAILED', async t => {
  const { other, engine } = fixture(t);
  other.exec('BEGIN IMMEDIATE');
  for (const [capability, args] of [
    ['memory.propose', { project: 'p', statement: 'a rule worth keeping', source: 'test' }],
    ['session.checkpoint', { project: 'p', task: 'T1', expectedVersion: 0, idempotencyKey: 'busy-1', content: { objective: 'o', nextAction: 'n', status: 'in_progress' } }]
  ]) {
    const reply = await engine.invoke(capability, args, principal);
    assert.equal(reply.ok, false, capability); assert.equal(reply.error, 'STORE_BUSY', capability); assert.equal(reply.data, null);
    assert.match(reply.detail, /retry/i); assert.ok(!/sqlite|errcode|locked/i.test(reply.detail), 'no storage internals are exposed');
  }
  other.exec('ROLLBACK');
  const retried = await engine.invoke('session.checkpoint', { project: 'p', task: 'T1', expectedVersion: 0, idempotencyKey: 'busy-1', content: { objective: 'o', nextAction: 'n', status: 'in_progress' } }, principal);
  assert.equal(retried.ok, true, 'the same call succeeds once the other writer is gone');
});
test('other storage failures are still opaque, only busy/locked is retryable', async t => {
  const { store, engine } = fixture(t);
  store.db.exec('DROP TABLE events');
  await assert.rejects(engine.invoke('memory.propose', { project: 'p', statement: 'x', source: 's' }, principal), { code: 'EXECUTION_FAILED' });
});
