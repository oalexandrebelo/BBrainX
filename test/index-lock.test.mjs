import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BrainStore } from '../src/store.mjs';
import { hash } from '../src/primitives.mjs';
import { indexProject } from '../src/retrieval.mjs';

const FILES = 900;
function workspace(t, count = FILES) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bb-index-lock-'))), root = path.join(dir, 'repo'); fs.mkdirSync(root);
  for (let i = 0; i < count; i++) fs.writeFileSync(path.join(root, 'f' + String(i).padStart(4, '0') + '.ts'), 'export const value' + i + ' = ' + i + ';\n'.repeat(3));
  const store = new BrainStore(path.join(dir, 'state')); store.register('p', root);
  const other = new DatabaseSync(path.join(dir, 'state', 'brain.sqlite')); other.exec('PRAGMA busy_timeout=0');
  t.after(() => { other.close(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, root, store, other };
}
// Same definition as the published snapshot: hash of the ordered (path, hash) manifest of the indexed files.
const manifestSnapshot = rows => hash([...rows].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(({ path, hash }) => ({ path, hash })));
function committedState(other) {
  other.exec('BEGIN'); // one read snapshot: snapshot and files must agree inside it
  try {
    const snapshot = other.prepare("SELECT snapshot FROM projects WHERE id='p'").get().snapshot;
    const rows = other.prepare("SELECT path,hash FROM files WHERE project='p'").all();
    return { snapshot, rows };
  } finally { other.exec('ROLLBACK'); }
}
// Observes every workspace file read made by indexProject, from the store's own thread.
function observeReads(root, fn) {
  const original = fs.readFileSync, seen = [];
  fs.readFileSync = function (file, ...rest) { if (typeof file === 'string' && file.startsWith(root + path.sep)) fn(file, seen.length); if (typeof file === 'string' && file.startsWith(root + path.sep)) seen.push(file); return original.call(this, file, ...rest); };
  return { seen, restore: () => { fs.readFileSync = original; } };
}

test('indexing reads workspace files without holding the write lock, so other writers are never blocked by file I/O', t => {
  const { root, store, other } = workspace(t); let probes = 0, blocked = [];
  const reads = observeReads(root, (file, n) => {
    if (n % 25 !== 0) return;
    probes++;
    try { other.exec('BEGIN IMMEDIATE'); other.exec('ROLLBACK'); } catch (e) { blocked.push(path.basename(file) + ':' + e.errcode); }
    if (store.db.isTransaction) blocked.push(path.basename(file) + ':read-inside-transaction');
  });
  try { assert.equal(indexProject(store, 'p').files, FILES); } finally { reads.restore(); }
  assert.ok(probes >= 30, 'the probe ran during the scan (' + probes + ')');
  assert.deepEqual(blocked, [], 'a competing writer was blocked, or a file was read inside a write transaction');
});
test('every committed state of a long index is internally consistent: the snapshot equals the manifest of the indexed files', t => {
  const { root, store, other } = workspace(t); const states = [];
  const reads = observeReads(root, (file, n) => { if (n % 10 === 0) states.push(committedState(other)); });
  let result;
  try { result = indexProject(store, 'p'); } finally { reads.restore(); }
  states.push(committedState(other));
  for (const { snapshot, rows } of states) if (snapshot !== null) assert.equal(snapshot, manifestSnapshot(rows), 'published snapshot describes a different manifest than the indexed files (' + rows.length + ' files)');
  const final = committedState(other);
  assert.equal(final.snapshot, result.snapshot); assert.equal(final.rows.length, FILES);
  assert.equal(result.changed, FILES); assert.equal(result.reused, 0); assert.equal(result.removed, 0);
});
test('a re-index only rewrites what changed, removes what disappeared, and a limit failure leaves the index untouched', t => {
  const { root, store, other } = workspace(t, 120);
  const first = indexProject(store, 'p'); const before = committedState(other);
  fs.writeFileSync(path.join(root, 'f0007.ts'), 'export const changed = true;\n'); fs.rmSync(path.join(root, 'f0008.ts')); fs.writeFileSync(path.join(root, 'added.ts'), 'export const added = 1;\n');
  assert.throws(() => indexProject(store, 'p', { maxFiles: 50 }), { code: 'INDEX_FILE_LIMIT' });
  assert.deepEqual(committedState(other), before, 'a refused index changes nothing');
  const second = indexProject(store, 'p');
  assert.deepEqual([second.changed, second.reused, second.removed, second.files], [2, 118, 1, 120]);
  assert.notEqual(second.snapshot, first.snapshot); const after = committedState(other);
  assert.equal(after.snapshot, second.snapshot); assert.equal(after.snapshot, manifestSnapshot(after.rows));
  assert.equal(indexProject(store, 'p').snapshot, second.snapshot, 'same tree, same snapshot');
});
test('a file that changes while the index is running is stored consistently, never as a hash that does not match its text', t => {
  const { root, store, other } = workspace(t, 400); let touched = false;
  const before = fs.readFileSync(path.join(root, 'f0390.ts'), 'utf8'), after = 'export const late = "changed during the index";\n';
  // f0390.ts has been read by the first scan when f0399.ts (the last of the scan) is read; change it right then.
  const reads = observeReads(root, file => { if (!touched && file.endsWith('f0399.ts')) { touched = true; fs.writeFileSync(path.join(root, 'f0390.ts'), after); } });
  let result;
  try { result = indexProject(store, 'p'); } finally { reads.restore(); }
  assert.ok(touched, 'the change really happened mid-index');
  const state = committedState(other);
  assert.equal(state.snapshot, result.snapshot); assert.equal(state.snapshot, manifestSnapshot(state.rows));
  const stored = state.rows.find(r => r.path === 'f0390.ts').hash;
  const body = other.prepare("SELECT group_concat(body, char(10)) AS body FROM chunks WHERE project='p' AND path='f0390.ts' ORDER BY start_line").get().body;
  assert.ok((stored === hash(Buffer.from(before)) && body === before) || (stored === hash(Buffer.from(after)) && body === after), 'the stored hash and text describe the same version of the file');
  assert.ok(indexProject(store, 'p').changed <= 1, 'the next index converges');
  assert.equal(committedState(other).rows.find(r => r.path === 'f0390.ts').hash, hash(Buffer.from(after)));
});
