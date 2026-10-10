import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), source = path.join(root, 'src/shared-admission.mjs');
const output = path.resolve(process.argv[2] ?? 'artifacts/shared-admission/negative'); fs.mkdirSync(output, { recursive: true });
const original = fs.readFileSync(source, 'utf8'), sha = text => createHash('sha256').update(text).digest('hex');
const replace = (text, from, to) => { assert.equal(text.split(from).length, 2, 'MUTATION_TARGET_NOT_UNIQUE'); return text.replace(from, to); };
const mutations = [
  ['slot-limit-removed', s => replace(replace(s, "      if (r.held_slots >= r.slots) return { ok: false, reason: 'SHARED_SLOT_LIMIT' };", ''), 'CHECK(held_slots>=0 AND held_slots<=slots)', 'CHECK(held_slots>=0)')],
  ['byte-limit-removed', s => replace(replace(s, "      if (bytes > r.byte_limit - r.held_bytes) return { ok: false, reason: 'SHARED_BYTE_LIMIT' };", ''), 'CHECK(held_bytes>=0 AND held_bytes<=byte_limit)', 'CHECK(held_bytes>=0)')],
  ['token-not-checked', s => replace(s, "timingSafeEqual(Buffer.from(row.token_hash, 'hex'), Buffer.from(digest(h.token), 'hex'))", 'true')],
  ['close-frees-work', s => replace(s, 'this.#statements.clear(); this.#db.close(); this.#closed = true;', 'this.#db.exec("UPDATE admission_reservations SET state=\'released\'; UPDATE admission_resources SET held_slots=0,held_bytes=0"); this.#statements.clear(); this.#db.close(); this.#closed = true;')],
  ['acquire-audit-omitted', s => replace(s, 'const row = this.#row(generation); this.#event(row);', 'const row = this.#row(generation);')],
  ['unknown-ordinary-release', s => replace(s, "row.state === 'running' || transition === 'reconcile' && row.state === 'unknown'", "row.state === 'running' || row.state === 'unknown'")]
];
const results = [];
for (const [id, mutate] of mutations) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-admission-negative-'));
  try {
    fs.mkdirSync(path.join(directory, 'src')); fs.mkdirSync(path.join(directory, 'test'));
    const changed = mutate(original); assert.notEqual(changed, original);
    fs.writeFileSync(path.join(directory, 'src/shared-admission.mjs'), changed);
    // O módulo agora importa o helper real de bootstrap: ausência de dependência não detecta mutante.
    fs.copyFileSync(path.join(root, 'src/sqlite-init.mjs'), path.join(directory, 'src/sqlite-init.mjs'));
    fs.copyFileSync(path.join(root, 'test/shared-admission.test.mjs'), path.join(directory, 'test/shared-admission.test.mjs'));
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'test/shared-admission.test.mjs'], { cwd: directory, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    const log = (run.stdout ?? '') + (run.stderr ?? ''); fs.writeFileSync(path.join(output, id + '.log'), log);
    const assertions = (log.match(/code: 'ERR_ASSERTION'/g) ?? []).length;
    const detected = !run.error && run.status !== 0 && assertions > 0 && !log.includes('SyntaxError:') && !log.includes('ERR_MODULE_NOT_FOUND');
    results.push({ id, detected, assertionFailures: assertions, exitCode: run.status, mutantSha256: sha(changed) });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
assert.equal(sha(fs.readFileSync(source, 'utf8')), sha(original), 'SOURCE_CHANGED_BY_NEGATIVE_CONTROL');
const report = { scope: 'six-deliberate-regressions-not-general-mutation-score', observedAt: new Date().toISOString(), node: process.version, sourceSha256: sha(original), results };
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
if (!results.every(x => x.detected)) process.exitCode = 1;
