import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { laneFixture } from './fixtures/lane-setup.mjs';
import { LaneStore } from '../src/lanes/store.mjs';
import { LaneRegistry } from '../src/lanes/registry.mjs';
import { indexProject } from '../src/retrieval.mjs';
const fixture = name => fileURLToPath(new URL('./fixtures/' + name, import.meta.url));
const cp = { objective: 'Work', nextAction: 'review', status: 'review_needed' };
const laneDb = (f, lane) => path.join(f.registry.stateDirectory('product', lane), 'brain.sqlite');
function child(t, name, args) {
  const c = fork(fixture(name), args, { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  c.stderr.on('data', () => {}); t.after(() => { if (c.exitCode === null) c.kill(); });
  const messages = []; c.on('message', m => messages.push(m));
  const next = (match, ms = 15000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('child message timeout')), ms), look = () => {
      const hit = messages.find(match); if (hit) { clearTimeout(timer); resolve(hit); } };
    c.on('message', look); look();
  });
  return { c, next };
}
function openLane(f, lane, t) { const s = new LaneStore(f.home, 'product', lane); s.beginOperation(); indexProject(s, 'product'); t.after(() => { try { s.close(); } catch { /* closed by the test */ } }); return s; }
const rows = (store, table) => store.db.prepare('SELECT count(*) AS n FROM ' + table).get().n;

// A lane writer that has to wait for its own lane database (a big index in another process) must not hold the shared locks
// (registry, memory authority) while it waits: other lanes would time out with SQLITE_BUSY at the registry's 1.5 s.
for (const op of ['checkpoint', 'context']) {
  test('a ' + op + ' write waiting on its lane database does not block independent lanes or the memory authority', async t => {
    const f = laneFixture(t), alpha = openLane(f, 'alpha', t), beta = openLane(f, 'beta', t);
    alpha.close();
    const writer = child(t, 'lane-blocked-writer.mjs', [f.home, 'alpha', op]); await writer.next(m => m.ready);
    const holder = child(t, 'lane-db-holder.mjs', [laneDb(f, 'alpha'), '3500']); await holder.next(m => m.held);
    writer.c.send({ go: true }); await writer.next(m => m.phase === 'calling');
    await new Promise(resolve => setTimeout(resolve, 400)); // the writer is now parked on the lane database lock
    const began = performance.now();
    const saved = beta.checkpoint('product', 'T-BETA', cp, 0, 'k-beta');
    const proposed = beta.proposeMemory('product', 'proposal while another lane waits', 'test');
    const free = new DatabaseSync(path.join(f.home, 'brain.sqlite')); free.exec('PRAGMA busy_timeout=300');
    try { free.exec('BEGIN IMMEDIATE'); free.exec('ROLLBACK'); } finally { free.close(); }
    assert.equal(saved.version, 1); assert.ok(proposed.id);
    assert.ok(performance.now() - began < 1200, 'independent lane writes did not wait for the blocked lane: ' + Math.round(performance.now() - began) + ' ms');
    const result = await writer.next(m => m.done);
    assert.equal(result.ok, true, 'the waiting writer itself completes once the lane database frees up: ' + JSON.stringify(result));
    assert.ok(result.ms >= 2000, 'it really waited for the lane database');
  });
}

// Invariant: a retired lane epoch never receives a checkpoint write, whichever side of the commit the close lands on.
test('close before the commit gate rolls the whole checkpoint back', t => {
  const f = laneFixture(t), s = openLane(f, 'alpha', t), epoch = s.binding.epoch;
  const original = s.registry.transaction.bind(s.registry); let injected = false;
  s.registry.transaction = fn => { if (!injected) { injected = true; f.registry.retire('product', 'alpha', epoch); } return original(fn); };
  assert.throws(() => s.checkpoint('product', 'T', cp, 0, 'k'), { code: 'LANE_NOT_ACTIVE' }); assert.ok(injected);
  for (const table of ['tasks', 'task_history', 'idempotency']) assert.equal(rows(s, table), 0, table + ' must stay empty');
  assert.equal(s.db.prepare("SELECT count(*) AS n FROM events WHERE type='checkpoint.created'").get().n, 0);
  assert.equal(s.db.isTransaction, false);
});
test('a close cannot slip in between the validation and the commit of a checkpoint', t => {
  const f = laneFixture(t), s = openLane(f, 'alpha', t), epoch = s.binding.epoch, outcome = {};
  const exec = s.db.exec.bind(s.db);
  s.db.exec = sql => {
    if (sql === 'COMMIT' && !('retired' in outcome)) {
      const other = new LaneRegistry(f.home); other.db.exec('PRAGMA busy_timeout=50');
      try { other.retire('product', 'alpha', epoch); outcome.retired = true; } catch (e) { outcome.retired = false; outcome.errcode = e.errcode; } finally { other.close(); }
    }
    return exec(sql);
  };
  let failure = null, saved = null;
  try { saved = s.checkpoint('product', 'T', cp, 0, 'k'); } catch (e) { failure = e; }
  s.db.exec = exec;
  if (outcome.retired) { assert.ok(failure, 'a close that landed before the commit must fail the checkpoint'); assert.equal(rows(s, 'task_history'), 0, 'no write survives in a closed epoch'); }
  else { assert.equal(saved?.version, 1, String(failure)); assert.equal(outcome.errcode, 5, 'the close was excluded for the duration of the commit'); assert.equal(rows(s, 'task_history'), 1); }
  f.registry.retire('product', 'alpha', epoch); // after the close, whatever happened above, nothing more may be written
  assert.throws(() => s.checkpoint('product', 'T', cp, saved ? 1 : 0, 'k2'), { code: 'LANE_NOT_ACTIVE' });
  assert.equal(rows(s, 'task_history'), saved ? 1 : 0);
});
test('a close cannot slip in between the validation and the commit of a context event', t => {
  const f = laneFixture(t), s = openLane(f, 'alpha', t), epoch = s.binding.epoch, outcome = {};
  s.approvedMemoryCount('product');
  const exec = s.db.exec.bind(s.db);
  s.db.exec = sql => {
    if (sql === 'COMMIT' && !('retired' in outcome)) {
      const other = new LaneRegistry(f.home); other.db.exec('PRAGMA busy_timeout=50');
      try { other.retire('product', 'alpha', epoch); outcome.retired = true; } catch (e) { outcome.retired = false; outcome.errcode = e.errcode; } finally { other.close(); }
    }
    return exec(sql);
  };
  let failure = null;
  try { s.commitContextEvent('product', { packId: 'p1', payloadTokens: 1, sourceCount: 0 }); } catch (e) { failure = e; }
  s.db.exec = exec;
  const events = s.db.prepare("SELECT count(*) AS n FROM events WHERE type='context.compiled'").get().n;
  if (outcome.retired) { assert.ok(failure); assert.equal(events, 0, 'no event survives in a closed epoch'); }
  else { assert.equal(failure, null, String(failure)); assert.equal(outcome.errcode, 5); assert.equal(events, 1); }
});
test('closing a lane while another process checkpoints it: nothing is committed once the close has returned', async t => {
  for (const delay of [150, 300, 450]) {
    const f = laneFixture(t), reader = (() => { const s = openLane(f, 'beta', t); return s; })();
    const loop = child(t, 'lane-checkpoint-loop.mjs', [f.home, 'alpha']); await loop.next(m => m.ready);
    await new Promise(resolve => setTimeout(resolve, delay));
    const epoch = f.registry.active('product', 'alpha').epoch;
    for (let attempt = 1; ; attempt++) { try { f.registry.retire('product', 'alpha', epoch); break; } catch (e) { if (e.errcode !== 5 || attempt === 3) throw e; } }
    // In WAL a commit never blocks a reader; only the loop's last-connection close (checkpoint + -wal removal under an
    // exclusive lock) can, and that is not a commit. Without a busy timeout this probe failed with SQLITE_BUSY in that window.
    const reading = new DatabaseSync(laneDb(f, 'alpha'), { readOnly: true, timeout: 5000 });
    const atClose = reading.prepare('SELECT count(*) AS n FROM task_history').get().n;
    const result = await loop.next(m => m.done); await once(loop.c, 'exit');
    const final = reading.prepare('SELECT count(*) AS n FROM task_history').get().n; reading.close();
    assert.equal(final, atClose, 'the loop committed ' + (final - atClose) + ' checkpoint(s) after the close returned');
    assert.equal(final, result.acked, 'every committed checkpoint was acknowledged, none lost in the race');
    assert.equal(result.stop, 'LANE_NOT_ACTIVE'); assert.ok(result.acked > 0, 'the loop really ran before the close');
    reader.close();
  }
});
