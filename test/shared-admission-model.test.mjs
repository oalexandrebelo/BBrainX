import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SharedAdmission } from '../src/shared-admission.mjs';
const H = c => c.repeat(64);

test('1200 deterministic generated transitions match an independent reservation model', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-admission-model-'));
  const a = new SharedAdmission(home, { reconcileVerifier: () => true }), b = new SharedAdmission(home, { reconcileVerifier: () => true });
  t.after(() => { a.close(); b.close(); fs.rmSync(home, { recursive: true, force: true }); });
  a.registerResource({ id: 'neural', physicalKey: H('a'), slots: 3, byteLimit: 7 });
  let seed = 19088743, issued = 0;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const reference = [], handles = new Map();
  for (let step = 0; step < 1200; step++) {
    const db = step % 2 ? a : b, operation = random() % 4, live = reference.filter(x => x.state !== 'released');
    if (operation === 0 || live.length === 0) {
      const bytes = 1 + random() % 5, occupied = live.reduce((sum, x) => sum + x.bytes, 0);
      const result = db.acquire({ resource: 'neural', bytes, scopeDigest: H('b'), requestDigest: H('c') });
      const accepted = live.length < 3 && occupied + bytes <= 7;
      assert.equal(result.ok, accepted, 'step:' + step);
      if (accepted) { issued++; assert.equal(result.handle.generation, issued); reference.push({ generation: issued, bytes, state: 'running', revision: 1 }); handles.set(issued, result.handle); }
    } else {
      const selected = live[random() % live.length], handle = handles.get(selected.generation);
      if (operation === 1 && selected.state === 'running') {
        db.markUnknown(handle, { expectedRevision: selected.revision, reason: 'timeout' }); selected.state = 'unknown'; selected.revision++;
      } else if (operation === 2 && selected.state === 'running') {
        db.release(handle, { expectedRevision: selected.revision, evidenceDigest: H('d') }); selected.state = 'released'; selected.revision++;
      } else if (operation === 3) {
        db.reconcile({ ledgerId: db.ledgerId, generation: selected.generation, expectedRevision: selected.revision, kind: 'operator-confirmed-quiescence', evidenceDigest: H('d') }); selected.state = 'released'; selected.revision++;
      }
    }
    const view = db.inspect(), remaining = reference.filter(x => x.state !== 'released');
    assert.equal(view.resources[0].heldSlots, remaining.length); assert.equal(view.resources[0].heldBytes, remaining.reduce((s, x) => s + x.bytes, 0));
    assert.equal(view.issued, issued);
    assert.deepEqual(view.reservations.map(x => [x.generation, x.state, x.revision]), remaining.map(x => [x.generation, x.state, x.revision]));
  }
});
