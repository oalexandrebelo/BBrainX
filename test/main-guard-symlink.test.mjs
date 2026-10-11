import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const guard = await import('../src/main-module.mjs').catch(() => ({}));
const scratch = t => { const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bbrainx-main-'))); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const symlinkable = process.platform !== 'win32';
// app/current -> releases/<sha> é um symlink de diretório: process.argv[1] mantém o caminho do symlink e import.meta.url vem do realpath.
function viaSymlink(t, real, name) { const dir = scratch(t), link = path.join(dir, name); fs.symlinkSync(real, link, 'dir'); return link; }
const run = (script, args, { cwd = root, env = {} } = {}) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 30000, env: { PATH: process.env.PATH, ...env } });
const quiet = text => text.replace(/\(node:\d+\) ExperimentalWarning[^\n]*\n|\(Use `node --trace-warnings[^\n]*\n/g, '');

test('isMainModule reconhece o módulo principal por realpath e nunca lança', { skip: !symlinkable }, t => {
  const dir = scratch(t), real = path.join(dir, 'real.mjs'), link = path.join(dir, 'link.mjs');
  fs.writeFileSync(real, ''); fs.symlinkSync(real, link);
  const url = new URL('file://' + real).href;
  assert.equal(guard.isMainModule(url, real), true);
  assert.equal(guard.isMainModule(url, link), true, 'symlink para o mesmo arquivo');
  assert.equal(guard.isMainModule(url, path.join(dir, 'outro.mjs')), false);
  assert.equal(guard.isMainModule(url, undefined), false);
  assert.equal(guard.isMainModule(url, '-e'), false);
});

const cases = [
  ['lanes.mjs', ['--help'], /BBrainX Lanes/],
  ['usage.mjs', ['--help'], /BBrainX Observatory/],
  ['workstation.mjs', ['help'], /"usage"/],
  ['laya-bench.mjs', [], /laya-decision-bench/]
];
for (const [script, args, expected] of cases)
  test('scripts/' + script + ' executa quando chamado por um symlink de diretório (app/current)', { skip: !symlinkable }, t => {
    const link = viaSymlink(t, path.join(root, 'scripts'), 'current-scripts'), home = path.join(scratch(t), 'state');
    const result = run(path.join(link, script), args, { env: { BBRAINX_HOME: home } });
    assert.match(quiet(result.stdout + result.stderr), expected, script + ' não pode sair em silêncio (exit ' + result.status + ')');
  });

function gitFixture(t) {
  const dir = scratch(t), git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=T', '-c', 'user.email=t@example.invalid', '-C', dir, ...args], { stdio: 'ignore' });
  git('init', '-q'); fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x","version":"1.2.3"}\n'); fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}\n');
  git('add', '.'); git('commit', '-qm', 'init'); return dir;
}
test('project-status e package gravam o resultado quando chamados por symlink', { skip: !symlinkable }, t => {
  const link = viaSymlink(t, path.join(root, 'scripts'), 'current-scripts'), repo = gitFixture(t);
  const status = run(path.join(link, 'project-status.mjs'), [], { cwd: repo });
  assert.equal(JSON.parse(status.stdout || 'null')?.schemaVersion, 1, status.stderr);
  const manifest = run(path.join(link, 'package.mjs'), [], { cwd: repo });
  assert.equal(JSON.parse(manifest.stdout || 'null')?.trackedFiles, 2, manifest.stderr);
});

test('study-doc grava o documento quando chamado por symlink', { skip: !symlinkable }, t => {
  const app = scratch(t); for (const dir of ['scripts', 'web', 'docs', 'src']) fs.mkdirSync(path.join(app, dir));
  fs.copyFileSync(path.join(root, 'src', 'main-module.mjs'), path.join(app, 'src', 'main-module.mjs'));
  fs.copyFileSync(path.join(root, 'scripts', 'study-doc.mjs'), path.join(app, 'scripts', 'study-doc.mjs')); fs.copyFileSync(path.join(root, 'web', 'study-map.js'), path.join(app, 'web', 'study-map.js'));
  fs.writeFileSync(path.join(app, 'package.json'), '{"type":"module"}\n');
  const alias = path.join(app, 'current'); fs.symlinkSync(app, alias, 'dir');
  const result = run(path.join(alias, 'scripts', 'study-doc.mjs'), []);
  assert.match(result.stdout, /gravado:/, result.stderr); assert.equal(fs.existsSync(path.join(app, 'docs', 'STUDY_MAP.md')), true);
});

test('o fixture de engine CLI também reconhece o symlink', { skip: !symlinkable }, t => {
  const link = viaSymlink(t, path.join(root, 'test', 'fixtures'), 'fixtures'), result = run(path.join(link, 'contract-engine.mjs'), ['describe', 'text.length']);
  assert.match(result.stdout, /text\.length/, result.stderr);
});
