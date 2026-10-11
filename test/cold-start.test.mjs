import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const child = fileURLToPath(new URL('./fixtures/cold-open.mjs', import.meta.url));
const ROUNDS = 8, PROCESSES = 6;
function open(kind, home, barrier) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [child, kind, home, String(barrier)], { env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', () => {});
    p.on('close', () => { try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch { resolve({ ok: false, message: 'NO_OUTPUT ' + out.slice(0, 80) }); } });
  });
}
// A server that dies with "database is locked" on its first start is a failed harness connection, and harnesses do start several at once.
for (const kind of ['brain', 'registry']) {
  test('simultaneous cold start of ' + PROCESSES + ' processes on a brand-new ' + kind + ' database never fails (' + ROUNDS + ' rounds)', async t => {
    const failures = [];
    for (let round = 0; round < ROUNDS; round++) {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-cold-' + kind + '-')); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
      const barrier = Date.now() + 600;
      for (const result of await Promise.all(Array.from({ length: PROCESSES }, () => open(kind, home, barrier)))) if (!result.ok) failures.push(result);
    }
    assert.deepEqual(failures, [], failures.length + ' of ' + ROUNDS * PROCESSES + ' cold starts failed');
  });
}
