import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SharedAdmission } from '../src/shared-admission.mjs';
const H = c => c.repeat(64);
function home(t) { const h = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-admission-cli-')); t.after(() => fs.rmSync(h, { recursive: true, force: true })); return h; }
function cli(h, ...args) {
  return spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/admission.mjs', import.meta.url)), ...args, '--home', h], { encoding: 'utf8', timeout: 10000 });
}
// Node 22 imprime o aviso experimental do node:sqlite no stderr antes do código do produto; só essas duas linhas exatas saem.
const productStderr=text=>text.split('\n').filter(line=>!/^\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature/.test(line)&&!/^\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)$/.test(line)).join('\n');
test('CLI status on an absent ledger is read-only, and registration is explicit', t => {
  const h = home(t), before = fs.readdirSync(h), r = cli(h, 'status');
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).installed, false); assert.deepEqual(fs.readdirSync(h), before);
  const registered = cli(h, 'register', '--resource', 'neural', '--physical-key', H('a'), '--slots', '1', '--bytes', '100');
  assert.equal(registered.status, 0, registered.stderr); assert.equal(JSON.parse(cli(h, 'status').stdout).resources[0].slots, 1);
});
test('CLI rejects reconciliation without explicit confirmation and preserves active capacity', t => {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-admission-cli-')), db = new SharedAdmission(h);
  t.after(() => { db.close(); fs.rmSync(h, { recursive: true, force: true }); });
  db.registerResource({ id: 'neural', physicalKey: H('a'), slots: 1, byteLimit: 100 });
  const a = db.acquire({ resource: 'neural', bytes: 1, scopeDigest: H('b'), requestDigest: H('c') });
  const args = ['reconcile', '--ledger-id', db.ledgerId, '--generation', String(a.handle.generation), '--revision', '1', '--evidence', H('d')];
  assert.equal(cli(h, ...args).status, 1); assert.equal(db.inspect().resources[0].heldSlots, 1);
  const confirmed = cli(h, ...args, '--confirm-resource-stopped'); assert.equal(confirmed.status, 0, confirmed.stderr);
  const result = JSON.parse(confirmed.stdout); assert.equal(result.evidenceKind, 'operator-attestation'); assert.equal(result.automaticProcessVerification, false);
  assert.equal(db.inspect().resources[0].heldSlots, 0);
});
test('CLI does not silently ignore unused options', t => {
  const h = home(t); assert.equal(cli(h, 'status', '--slots', '3').status, 1);
});

test('CLI refuses duplicate options instead of silently selecting the last policy', t => {
  const h = home(t); assert.equal(cli(h, 'register', '--resource', 'a', '--resource', 'b', '--physical-key', H('a'), '--slots', '1', '--bytes', '100').status, 1);
});
test('shared Laya CLI help is usable without weights or mutation of the host', t => {
  const h = home(t), entry = fileURLToPath(new URL('../scripts/laya-shared.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [entry, '--help'], { encoding: 'utf8', timeout: 10000, env: { ...process.env, BBRAINX_HOME: h } });
  assert.equal(r.status, 0, r.stderr); assert(r.stdout.includes('admissão')); assert.deepEqual(fs.readdirSync(h), []);
  const fail = spawnSync(process.execPath, [entry, '--project', 'p', '--resource', 'neural', '--reserve-bytes', '100', '--file', 'missing.json'], {
    encoding: 'utf8', timeout: 10000, env: { ...process.env, BBRAINX_HOME: h }
  });
  assert.equal(fail.status, 1); assert(fail.stderr.includes('LAYA_NOT_INSTALLED')); assert.deepEqual(fs.readdirSync(h), []);
});

test('CLI failures name their real error code instead of a generic one, with stdout empty', t => {
  const h = home(t);
  for (const [args, code] of [
    [['status', '--slots', '3'], 'UNUSED_ADMISSION_OPTION'],
    [['register', '--resource', 'a', '--resource', 'b', '--physical-key', H('a'), '--slots', '1', '--bytes', '100'], 'DUPLICATE_ADMISSION_OPTION'],
    [['frobnicate'], 'INVALID_ADMISSION_COMMAND'],
    [['reconcile', '--ledger-id', 'x', '--generation', '1', '--revision', '1', '--evidence', H('d')], 'EXPLICIT_OPERATOR_CONFIRMATION_REQUIRED'],
    [['status', '--bogus'], 'ERR_PARSE_ARGS_UNKNOWN_OPTION']
  ]) {
    const r = cli(h, ...args);
    assert.equal(r.status, 1, args.join(' ')); assert.equal(r.stdout, '', args.join(' '));
    assert.deepEqual(JSON.parse(productStderr(r.stderr)), { error: code }, args.join(' '));
  }
});
