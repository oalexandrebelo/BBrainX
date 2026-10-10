import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {BrainStore} from '../src/store.mjs';
import {runProjectTests} from '../src/test-runner.mjs';

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bbrainx-test-runner-'));
  const root = path.join(temp, 'project');
  fs.mkdirSync(root);
  const brain = new BrainStore(path.join(temp, 'state'));
  brain.register('sample', root);
  t.after(() => { brain.close(); fs.rmSync(temp, {recursive:true, force:true}); });
  return {brain, root};
}

test('executes selected Node tests and reports bounded progress and final counts', async t => {
  const {brain, root} = fixture(t), updates = [], updateTimes = [];
  fs.writeFileSync(path.join(root, 'one.test.mjs'), `
    import assert from 'node:assert/strict';
    import test from 'node:test';
    test('a named passing test', () => assert.equal(2 + 2, 4));
    test('an intentionally skipped test', {skip:true}, () => {});
  `);
  const result = await runProjectTests(brain, {project:'sample', files:['one.test.mjs'], task:'verification', onUpdate:r=>{updates.push(r);updateTimes.push(Date.now());}});
  assert.equal(result.status, 'passed');
  assert.equal(result.runner, 'node:test');
  assert.equal(result.total, 2);
  assert.equal(result.passed, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.completed, 2);
  assert.equal(result.failures.length, 0);
  assert.ok(result.startedAt && result.finishedAt);
  assert.equal(result.revision, null);
  assert.ok(updates.length >= 2);
  assert.ok(updates.every(update => update.status === 'running' || update.status === 'passed'));
  assert.ok(updates.every(update => !('stdout' in update) && !('stderr' in update)));
  assert.ok(updateTimes.slice(1).every((time,index) => time - updateTimes[index] >= 190));
});

test('returns structured failure details without exposing raw process output', async t => {
  const {brain, root} = fixture(t);
  fs.writeFileSync(path.join(root, 'fail.test.mjs'), `
    import assert from 'node:assert/strict';
    import test from 'node:test';
    test('a named failing test', () => assert.equal('actual', 'expected'));
    console.log('must not be captured as run output');
  `);
  const result = await runProjectTests(brain, {project:'sample', files:['fail.test.mjs']});
  assert.equal(result.status, 'failed');
  assert.equal(result.exitCode, 1);
  assert.equal(result.total, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].name, /a named failing test/);
  assert.match(result.failures[0].message, /actual|expected/);
  assert.ok(!JSON.stringify(result).includes('must not be captured as run output'));
});

test('counts and discards project stdout before stopping output beyond the aggregate limit', async t => {
  const {brain, root} = fixture(t);
  fs.writeFileSync(path.join(root, 'loud.test.mjs'), `
    import test from 'node:test';
    test('writes excessive output', () => console.log('PRIVATE_OUTPUT_MARKER'.padEnd(4 * 1024 * 1024 + 100, 'x')));
  `);
  const result = await runProjectTests(brain, {project:'sample', files:['loud.test.mjs']});
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'TEST_OUTPUT_LIMIT');
  assert.ok(!JSON.stringify(result).includes('PRIVATE_OUTPUT_MARKER'));
});

test('caps Unicode failure diagnostics by count and serialized bytes while preserving test counts', async t => {
  const {brain, root} = fixture(t), definitions = [];
  for (let index = 0; index < 30; index++) definitions.push(`test('falha 😀 ${index}', () => assert.fail('falhou: ${'á'.repeat(500)}'));`);
  fs.writeFileSync(path.join(root, 'many-failures.test.mjs'), `import assert from 'node:assert/strict'; import test from 'node:test'; ${definitions.join('\n')}`);
  const result = await runProjectTests(brain, {project:'sample', files:['many-failures.test.mjs']});
  assert.equal(result.status, 'failed');
  assert.equal(result.failed, 30);
  assert.equal(result.failures.length, 20);
  assert.equal(result.failuresTruncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(result.failures)) <= 32 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 64 * 1024);
  assert.ok(result.failures[0].name.includes('😀'));
});

test('rejects flags, paths outside the registered root, directories and symlink escapes', async t => {
  const {brain, root} = fixture(t), outside = path.join(path.dirname(root), 'outside.test.mjs');
  fs.writeFileSync(path.join(root, 'inside.test.mjs'), "import test from 'node:test'; test('ok',()=>{});");
  fs.writeFileSync(outside, "import test from 'node:test'; test('outside',()=>{});");
  t.after(() => fs.rmSync(outside, {force:true}));
  await assert.rejects(runProjectTests(brain, {project:'sample', files:['--help']}), {code:'INVALID_TEST_FILE'});
  await assert.rejects(runProjectTests(brain, {project:'sample', files:['../outside.test.mjs']}), {code:'INVALID_TEST_FILE'});
  await assert.rejects(runProjectTests(brain, {project:'sample', files:['.']}), {code:'INVALID_TEST_FILE'});
  if (process.platform !== 'win32') {
    fs.symlinkSync(outside, path.join(root, 'escape.test.mjs'));
    await assert.rejects(runProjectTests(brain, {project:'sample', files:['escape.test.mjs']}), {code:'INVALID_TEST_FILE'});
  }
  await assert.rejects(runProjectTests(brain, {project:'sample', files:Array(101).fill('inside.test.mjs')}), {code:'TOO_MANY_TEST_FILES'});
});

test('does not spawn tests when the initial run-record callback fails', async t => {
  const {brain, root} = fixture(t);
  fs.writeFileSync(path.join(root, 'side-effect.test.mjs'), `import fs from 'node:fs'; fs.writeFileSync('test-started.marker','yes');`);
  await assert.rejects(runProjectTests(brain, {project:'sample', files:['side-effect.test.mjs'], onUpdate:async()=>{throw new Error('audit storage unavailable');}}), /audit storage unavailable/);
  assert.equal(fs.existsSync(path.join(root, 'test-started.marker')), false);
});

test('stops a started run when progress persistence fails and returns a failed record', async t => {
  const {brain, root} = fixture(t), updates = [];
  fs.writeFileSync(path.join(root, 'long.test.mjs'), `
    import fs from 'node:fs'; import test from 'node:test';
    fs.writeFileSync('test-started.marker','yes');
    test('long test', async () => new Promise(resolve => setTimeout(resolve, 10000)));
  `);
  let calls = 0;
  const result = await runProjectTests(brain, {project:'sample', files:['long.test.mjs'], timeoutMs:5000, onUpdate:async record=>{
    calls++;updates.push(record);
    if(calls===2) throw new Error('progress storage unavailable');
  }});
  assert.ok(fs.existsSync(path.join(root, 'test-started.marker')));
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'UPDATE_CALLBACK_FAILED');
  assert.ok(updates.some(update=>update.status==='failed'));
});

test('coalesces slow progress persistence and writes the latest final snapshot', async t => {
  const {brain, root} = fixture(t), updates = [];
  const definitions = Array.from({length:40}, (_, index) => `test('slow progress ${index}', async () => new Promise(resolve => setTimeout(resolve, 20)));`).join('\n');
  fs.writeFileSync(path.join(root, 'progress.test.mjs'), `import test from 'node:test'; ${definitions}`);
  let active = 0, maxActive = 0;
  const started = Date.now();
  const result = await runProjectTests(brain, {project:'sample', files:['progress.test.mjs'], onUpdate:async snapshot=>{
    active++; maxActive = Math.max(maxActive, active); updates.push(snapshot);
    await new Promise(resolve => setTimeout(resolve, 350));
    active--;
  }});
  assert.equal(result.status, 'passed');
  assert.equal(result.total, 40);
  assert.equal(maxActive, 1);
  assert.ok(updates.length <= 6, `expected coalesced writes, received ${updates.length}`);
  assert.equal(updates.at(-1).status, 'passed');
  assert.equal(updates.at(-1).completed, 40);
  assert.ok(Date.now() - started < 5000, `slow writes serialized too many stale snapshots (${Date.now() - started}ms)`);
});

test('refuses a registered root replaced by a symlink before running project code', async t => {
  const {brain, root} = fixture(t), original = root + '-original', outside = root + '-outside';
  fs.mkdirSync(outside);fs.writeFileSync(path.join(outside, 'outside.test.mjs'), "import fs from 'node:fs'; fs.writeFileSync('outside-ran.marker','yes');");
  fs.renameSync(root, original);fs.symlinkSync(outside, root, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(runProjectTests(brain, {project:'sample', files:['outside.test.mjs']}), {code:'PROJECT_ROOT_CHANGED'});
  assert.equal(fs.existsSync(path.join(outside, 'outside-ran.marker')), false);
});

test('timeout terminates a test and its descendant on POSIX', {skip:process.platform === 'win32'}, async t => {
  const {brain, root} = fixture(t), pidFile = path.join(root, 'descendant.pid');
  fs.writeFileSync(path.join(root, 'hang.test.mjs'), `
    import fs from 'node:fs';
    import {spawn} from 'node:child_process';
    import test from 'node:test';
    test('starts descendant then waits', async () => {
      const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], {stdio:'ignore'});
      fs.writeFileSync('descendant.pid', String(child.pid));
      await new Promise(() => {});
    });
  `);
  const result = await runProjectTests(brain, {project:'sample', files:['hang.test.mjs'], timeoutMs:800});
  assert.equal(result.status, 'timed_out');
  assert.ok(fs.existsSync(pidFile));
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  assert.ok(Number.isInteger(pid) && pid > 1);
  let alive = true;
  for (let attempt = 0; attempt < 30 && alive; attempt++) {
    try { process.kill(pid, 0); await new Promise(resolve => setTimeout(resolve, 100)); }
    catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
  }
  assert.equal(alive, false, `test descendant ${pid} remained after timeout`);
});
