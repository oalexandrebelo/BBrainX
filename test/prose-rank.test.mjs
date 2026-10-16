import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { literalShare } from '../src/declarations.mjs';
import { BrainStore } from '../src/store.mjs';
import { indexProject, search } from '../src/retrieval.mjs';

test('literal share counts string literals, not comments or code', () => {
  assert.equal(literalShare('const a = 1;\n', '.mjs'), 0);
  assert.equal(literalShare('// a long comment about retrying requests\nconst a = 1;\n', '.mjs'), 0, 'comments describe the implementation and do not count');
  const prompt = 'export const PROMPT = `You retry the request when the server answers 429 and wait before the next attempt.`;\n';
  assert.ok(literalShare(prompt, '.mjs') > 0.75, 'a prompt constant is mostly literal');
  assert.ok(Math.abs(literalShare("value = 'abc'\n", '.py') - 5 / 11) < 1e-9, 'quotes included: 5 of 11 visible characters');
  assert.equal(literalShare('', '.mjs'), 0);
});

test('the same words weigh less inside a string literal than in code with a comment', t => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bb-prose-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Arquivos neutros dão ao BM25 um IDF real; os dois candidatos têm os mesmos termos e quase o mesmo tamanho.
  for (const [name, body] of [['math', 'export const add = (a, b) => a + b;'], ['user', 'export function userName(u) { return u.first + " " + u.last; }'], ['date', 'export const today = () => new Date().toISOString().slice(0, 10);'],
    ['color', 'export const palette = { primary: "#065CFB", accent: "#E64F20" };'], ['list', 'export function unique(items) { return [...new Set(items)]; }'], ['money', 'export const cents = value => Math.round(value * 100);'],
    ['text', 'export function title(word) { return word[0].toUpperCase() + word.slice(1); }'], ['sleep', 'export const delay = ms => new Promise(r => setTimeout(r, ms));']]) fs.writeFileSync(path.join(root, name + '.mjs'), body + '\n');
  fs.writeFileSync(path.join(root, 'prompts.mjs'), 'export const T = "wait and retry the request";\n');
  fs.writeFileSync(path.join(root, 'client.mjs'), '// wait and retry the request\nexport const T = 0;\n');
  const store = new BrainStore(path.join(root, '.state'));t.after(() => store.close());
  store.register('p', root);indexProject(store, 'p');
  assert.deepEqual(search(store, 'p', 'wait and retry the request').items.slice(0, 2).map(i => i.path), ['client.mjs', 'prompts.mjs'],
    'without the literal-share weight, the string version ranks first (4.571 vs 4.422)');
});
