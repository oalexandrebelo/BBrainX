import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BrainStore } from '../src/store.mjs';
import { indexProject, inspectIndex, clearScanCache } from '../src/retrieval.mjs';

function project(t) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bb-scan-'))), root = path.join(base, 'repo');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'src', 'b.ts'), 'export const b = 2;\n');
  const store = new BrainStore(path.join(base, 'state')); store.register('p', root); indexProject(store, 'p');
  t.after(() => { store.close(); fs.rmSync(base, { recursive: true, force: true }); clearScanCache(); });
  return { root, store };
}

test('the scan cache never hides a change: same-size rewrite, replaced file, new secret, removal', t => {
  const { root, store } = project(t);
  assert.equal(inspectIndex(store, 'p').status, 'current');
  assert.equal(inspectIndex(store, 'p').status, 'current', 'warm cache, nothing changed');
  // Mesmo tamanho, mesmo inode, reescrita no lugar: o ctime muda.
  const a = path.join(root, 'src', 'a.ts'), before = fs.statSync(a);
  fs.writeFileSync(a, 'export const a = 9;\n');
  fs.utimesSync(a, before.atime, before.mtime); // até restaurando o mtime
  let report = inspectIndex(store, 'p');
  assert.equal(report.status, 'stale'); assert.equal(report.changes.changed, 1);
  indexProject(store, 'p'); assert.equal(inspectIndex(store, 'p').status, 'current');
  // Arquivo trocado por outro (novo inode) com o mesmo conteúdo de tamanho igual.
  const b = path.join(root, 'src', 'b.ts'), tmp = b + '.tmp';
  fs.writeFileSync(tmp, 'export const b = 3;\n'); fs.renameSync(tmp, b);
  report = inspectIndex(store, 'p'); assert.equal(report.status, 'stale'); assert.equal(report.changes.changed, 1);
  indexProject(store, 'p');
  // Passa a conter um segredo: sai do manifesto com o motivo, como no índice.
  fs.writeFileSync(b, 'const k = "ghp_' + 'x'.repeat(36) + '";\n');
  report = inspectIndex(store, 'p'); assert.equal(report.skippedByReason.SECRET_PATTERN_REJECTED, 1); assert.equal(report.status, 'stale');
  indexProject(store, 'p'); assert.equal(inspectIndex(store, 'p').status, 'current');
  assert.equal(inspectIndex(store, 'p').skippedByReason.SECRET_PATTERN_REJECTED, 1, 'a cached refusal stays a refusal');
  // Removido.
  fs.rmSync(a); report = inspectIndex(store, 'p'); assert.equal(report.status, 'stale'); assert.equal(report.changes.removed, 1);
});

test('a directory replaced by a symlink is refused even after the directory was verified in a previous scan', t => {
  const { root, store } = project(t);
  assert.equal(inspectIndex(store, 'p').status, 'current');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-outside-')); t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'a.ts'), 'export const a = 1;\n'); fs.writeFileSync(path.join(outside, 'b.ts'), 'export const b = 2;\n');
  fs.rmSync(path.join(root, 'src'), { recursive: true }); fs.symlinkSync(outside, path.join(root, 'src'));
  const report = inspectIndex(store, 'p');
  assert.equal(report.files, 0, 'nothing read through the symlink'); assert.equal(report.status, 'stale');
});
