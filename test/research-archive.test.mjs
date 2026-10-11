import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { included } from '../src/retrieval.mjs';

test('research artifacts remain versioned without masquerading as live runtime source', () => {
  const file='docs/artifacts/auditorias/2026-10-06-auditoria-codex/README.md';
  assert(fs.statSync(file).isFile());
  assert.equal(included(file),false);
  assert.equal(included('experiments/artifacts/witness-cache/lab/witness-cache.mjs'),false);
  assert.equal(included('docs/research/INDEX.md'),true);
  assert.equal(included('docs/lanes/ARCHITECTURE.md'),true);
  assert.equal(included('src/lanes/store.mjs'),true);
});
