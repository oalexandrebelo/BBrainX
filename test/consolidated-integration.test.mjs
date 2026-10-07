import test from 'node:test';
import assert from 'node:assert/strict';
import { laneFixture } from './fixtures/lane-setup.mjs';
import { LaneStore } from '../src/lanes/store.mjs';
import { compileContext, tokenCount } from '../src/context.mjs';
import { indexProject } from '../src/retrieval.mjs';
import { usageOverview } from '../src/usage/summary.mjs';

function measured(fn) {
  const before = process.env.BBRAINX_MEASURE_CONTEXT;
  process.env.BBRAINX_MEASURE_CONTEXT = '1';
  try { return fn(); }
  finally {
    if (before === undefined) delete process.env.BBRAINX_MEASURE_CONTEXT;
    else process.env.BBRAINX_MEASURE_CONTEXT = before;
  }
}
function openLane(fixture, lane) {
  const store = new LaneStore(fixture.home, 'product', lane);
  try { store.beginOperation(); indexProject(store, 'product'); return store; }
  catch (error) { store.close(); throw error; }
}

test('combined lanes and Observatory retain independent measurements and shared decisions', t => {
  const f = laneFixture(t);
  const memory = f.authority.proposeMemory('product', 'PRESERVE_PUBLIC_CONTRACT', 'ADR');
  f.authority.reviewMemory('product', memory.id, 'approved', 1);
  const a = openLane(f, 'alpha'), b = openLane(f, 'beta');
  try {
    const pa = measured(() => compileContext(a, {project:'product', query:'workspaceMarker', budget:2000}));
    const pb = measured(() => compileContext(b, {project:'product', query:'workspaceMarker', budget:2000}));
    for (const [store, pack, lane] of [[a, pa, 'alpha'], [b, pb, 'beta']]) {
      assert(pack.text.includes('PRESERVE_PUBLIC_CONTRACT'));
      assert.equal(pack.payloadTokens, tokenCount(pack.text));
      const event = store.events('product').find(e => e.type === 'context.compiled');
      assert.equal(event.payload.lane, lane);
      assert.equal(event.payload.measurementVersion, 'candidate-window-v1');
      assert(Number.isSafeInteger(event.payload.referenceTokens));
      assert(pack.text.includes(event.payload.memoryRevision));
      const report = usageOverview(store, 'product');
      assert.equal(report.context.knownPairs, 1);
      assert.equal(report.context.payloadTokens, pack.payloadTokens);
      assert.equal(report.usage.tokens.totalTokens.value, null);
    }
    assert.notEqual(pa.snapshot, pb.snapshot);
    assert.equal(usageOverview(f.authority, 'product').context.packs, 0);
  } finally { a.close(); b.close(); }
});

test('context instrumentation cannot bypass lane memory revision at publication', t => {
  const f = laneFixture(t);
  const m = f.authority.proposeMemory('product', 'RULE_BEFORE_REVOCATION', 'ADR');
  f.authority.reviewMemory('product', m.id, 'approved', 1);
  const s = openLane(f, 'alpha');
  try {
    const commit = s.commitContextEvent.bind(s);
    // Fault injection at the actual publication boundary; both databases are real.
    s.commitContextEvent = (project, payload) => {
      assert(Number.isSafeInteger(payload.referenceTokens));
      f.authority.reviewMemory('product', m.id, 'revoked', 2);
      return commit(project, payload);
    };
    assert.throws(() => measured(() => compileContext(s, {project:'product', query:'workspaceMarker', budget:2000})), {code:'SHARED_MEMORY_CHANGED'});
    assert.equal(s.events('product').filter(e => e.type === 'context.compiled').length, 0);
  } finally { s.close(); }
});

test('combined context measurement preserves mandatory checkpoint decisions and blockers', t => {
  const f = laneFixture(t), s = openLane(f, 'alpha');
  try {
    s.checkpoint('product', 'TASK', {objective:'Review', nextAction:'Wait for security', status:'blocked',
      done:Array.from({length:30}, (_,i) => ('history-'+i+' ').repeat(30)),
      decisions:['DO_NOT_CHANGE_API'], blockers:['SECURITY_REVIEW_REQUIRED']}, 0, 'first');
    const p = measured(() => compileContext(s, {project:'product',task:'TASK',query:'workspaceMarker',budget:1000}));
    assert(p.checkpointTrimmed);
    assert(p.text.includes('DO_NOT_CHANGE_API'));
    assert(p.text.includes('SECURITY_REVIEW_REQUIRED'));
    assert.equal(p.payloadTokens, tokenCount(p.text));
    assert.equal(usageOverview(s, 'product').context.knownPairs, 1);
  } finally { s.close(); }
});
