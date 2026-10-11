import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as host from '../src/host.mjs';
import { laneFixture } from './fixtures/lane-setup.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const posix = process.platform !== 'win32';
const CELLAR = '/opt/homebrew/Cellar/node@24/24.21.0/bin/node';
// Sistema de arquivos fictício: cada caminho conhecido aponta para o seu realpath; o resto é inexistente.
const fakeRealpath = table => target => { if (!Object.hasOwn(table, target)) throw Object.assign(new Error('ENOENT ' + target), { code: 'ENOENT' }); return table[target]; };

test('o keg do Homebrew vira o alias opt quando o alias resolve ao mesmo binário', () => {
  const realpath = fakeRealpath({ [CELLAR]: CELLAR, '/opt/homebrew/opt/node@24/bin/node': CELLAR });
  assert.equal(host.stableNodePath({ env: {}, execPath: CELLAR, realpath }), '/opt/homebrew/opt/node@24/bin/node');
});

test('alias ausente, de outra versão ou sem Cellar mantém o execPath (nunca emite caminho que não prova o mesmo binário)', () => {
  const other = '/opt/homebrew/Cellar/node@24/24.21.1/bin/node';
  assert.equal(host.stableNodePath({ env: {}, execPath: CELLAR, realpath: fakeRealpath({ [CELLAR]: CELLAR }) }), CELLAR, 'alias inexistente');
  assert.equal(host.stableNodePath({ env: {}, execPath: CELLAR, realpath: fakeRealpath({ [CELLAR]: CELLAR, '/opt/homebrew/opt/node@24/bin/node': other }) }), CELLAR, 'alias já aponta para outra versão');
  assert.equal(host.stableNodePath({ env: {}, execPath: '/usr/local/bin/node', realpath: fakeRealpath({ '/usr/local/bin/node': '/usr/local/bin/node' }) }), '/usr/local/bin/node');
});

test('Linuxbrew e fórmula sem versão no nome usam o mesmo mapeamento Cellar -> opt', () => {
  for (const [cellar, alias] of [['/home/linuxbrew/.linuxbrew/Cellar/node@22/22.1.0/bin/node', '/home/linuxbrew/.linuxbrew/opt/node@22/bin/node'], ['/usr/local/Cellar/node/25.9.0_2/bin/node', '/usr/local/opt/node/bin/node']])
    assert.equal(host.stableNodePath({ env: {}, execPath: cellar, realpath: fakeRealpath({ [cellar]: cellar, [alias]: cellar }) }), alias);
});

test('BBRAINX_NODE só vale se for absoluto e resolver ao mesmo executável; senão falha fechado', () => {
  const stable = '/Users/u/.local/node-current/bin/node', realpath = fakeRealpath({ [CELLAR]: CELLAR, [stable]: CELLAR, '/bin/sh': '/bin/sh' });
  assert.equal(host.stableNodePath({ env: { BBRAINX_NODE: stable }, execPath: CELLAR, realpath }), stable);
  assert.throws(() => host.stableNodePath({ env: { BBRAINX_NODE: '/bin/sh' }, execPath: CELLAR, realpath }), { code: 'NODE_PATH_MISMATCH' });
  for (const bad of ['node', '', '/nao/existe', '/x\ny']) assert.throws(() => host.stableNodePath({ env: { BBRAINX_NODE: bad }, execPath: CELLAR, realpath }), { code: 'INVALID_NODE_PATH' }, JSON.stringify(bad));
  assert.throws(() => host.stableNodePath({ env: { BBRAINX_NODE: '/bin/sh' }, execPath: CELLAR, realpath, errors: { mismatch: 'X_MISMATCH' } }), { code: 'X_MISMATCH' });
});

test('entry em releases/<sha> é emitido via app/current quando current resolve ao mesmo arquivo', () => {
  const self = '/Users/u/Library/Application Support/BBrainX/app/releases/f48cdcc/bin/bbrainx.mjs', via = '/Users/u/Library/Application Support/BBrainX/app/current/bin/bbrainx.mjs';
  assert.equal(host.stableEntryPath(self, { env: {}, realpath: fakeRealpath({ [self]: self, [via]: self }) }), via);
  assert.equal(host.stableEntryPath(self, { env: {}, realpath: fakeRealpath({ [self]: self }) }), self, 'sem current: o próprio arquivo');
  assert.equal(host.stableEntryPath(self, { env: {}, realpath: fakeRealpath({ [self]: self, [via]: '/Users/u/Library/Application Support/BBrainX/app/releases/outra/bin/bbrainx.mjs' }) }), self, 'current aponta para outra release');
  assert.equal(host.stableEntryPath('/repo/bin/bbrainx.mjs', { env: {}, realpath: fakeRealpath({ '/repo/bin/bbrainx.mjs': '/repo/bin/bbrainx.mjs' }) }), '/repo/bin/bbrainx.mjs', 'checkout comum não muda');
});

test('BBRAINX_ENTRY só vale se for absoluto e resolver ao arquivo em execução', () => {
  const self = '/app/releases/abc/bin/bbrainx.mjs', via = '/app/current/bin/bbrainx.mjs', realpath = fakeRealpath({ [self]: self, [via]: self, '/app/releases/old/bin/bbrainx.mjs': '/app/releases/old/bin/bbrainx.mjs' });
  assert.equal(host.stableEntryPath(self, { env: { BBRAINX_ENTRY: via }, realpath }), via);
  assert.equal(host.stableEntryPath(self, { env: { BBRAINX_ENTRY: '' }, realpath }), via, 'vazio equivale a ausente');
  assert.throws(() => host.stableEntryPath(self, { env: { BBRAINX_ENTRY: '/app/releases/old/bin/bbrainx.mjs' }, realpath }), { code: 'ENTRY_PATH_MISMATCH' });
  for (const bad of ['relativo.mjs', '/nao/existe.mjs']) assert.throws(() => host.stableEntryPath(self, { env: { BBRAINX_ENTRY: bad }, realpath }), { code: 'INVALID_ENTRY_PATH' }, bad);
});

// ---- ponta a ponta: cada emissor roda de um "Homebrew" e de uma "release" fictícios montados em pasta temporária ----
function scratch(t) { const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bbrainx-stable-'))); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
function fakeBrew(t) {
  const prefix = scratch(t), bin = path.join(prefix, 'Cellar', 'node@24', '24.21.0', 'bin'), node = path.join(bin, 'node');
  fs.mkdirSync(bin, { recursive: true });
  try { fs.linkSync(process.execPath, node); } catch { fs.copyFileSync(process.execPath, node); fs.chmodSync(node, 0o755); }
  // O node do Homebrew é um lançador que carrega libnode via @loader_path/../lib: o keg fictício aponta para as bibliotecas reais.
  const lib = path.join(path.dirname(process.execPath), '..', 'lib');
  if (fs.existsSync(lib)) fs.symlinkSync(lib, path.join(bin, '..', 'lib'), 'dir');
  fs.mkdirSync(path.join(prefix, 'opt')); fs.symlinkSync('../Cellar/node@24/24.21.0', path.join(prefix, 'opt', 'node@24'));
  return { node, alias: path.join(prefix, 'opt', 'node@24', 'bin', 'node') };
}
function fakeRelease(t) {
  const app = scratch(t), release = path.join(app, 'releases', 'f48cdcc');
  fs.mkdirSync(release, { recursive: true });
  for (const dir of ['bin', 'src', 'scripts']) fs.cpSync(path.join(root, dir), path.join(release, dir), { recursive: true });
  fs.copyFileSync(path.join(root, 'package.json'), path.join(release, 'package.json')); fs.symlinkSync(path.join(root, 'node_modules'), path.join(release, 'node_modules'), 'dir');
  fs.symlinkSync(release, path.join(app, 'current'), 'dir');
  return { app, release, current: path.join(app, 'current') };
}
const run = (node, args, env) => { const r = spawnSync(node, args, { encoding: 'utf8', timeout: 30000, env: { PATH: process.env.PATH, ...env } }); assert.equal(r.status, 0, r.stderr); return r.stdout; };

test('bbrainx config emite o alias opt do Homebrew e o entry via app/current', { skip: !posix }, t => {
  const brew = fakeBrew(t), rel = fakeRelease(t), home = path.join(scratch(t), 'state');
  const out = JSON.parse(run(brew.node, [path.join(rel.current, 'bin', 'bbrainx.mjs'), 'config', '--project', 'p', '--client', 'cursor'], { BBRAINX_HOME: home }).replace(/^#.*\n/, ''));
  assert.equal(out.mcpServers.bbrainx.command, brew.alias);
  assert.deepEqual(out.mcpServers.bbrainx.args.slice(0, 2), [path.join(rel.current, 'bin', 'bbrainx.mjs'), 'mcp']);
});

test('scripts/codex-project.mjs e scripts/lanes.mjs config emitem o mesmo caminho estável', { skip: !posix }, t => {
  const brew = fakeBrew(t), rel = fakeRelease(t), f = laneFixture(t);
  const env = { BBRAINX_HOME: f.home };
  const codex = JSON.parse(run(brew.node, [path.join(rel.current, 'scripts', 'codex-project.mjs'), '--project', 'product'], env));
  assert.match(codex.text, new RegExp('command = ' + JSON.stringify(brew.alias).replaceAll('\\', '\\\\')));
  assert.ok(codex.text.includes(JSON.stringify(path.join(rel.current, 'bin', 'bbrainx.mjs')).slice(1, -1)), codex.text);
  const lane = JSON.parse(run(brew.node, [path.join(rel.release, 'scripts', 'lanes.mjs'), 'config', '--project', 'product', '--lane', 'alpha', '--client', 'claude'], env));
  const server = lane.fragment.mcpServers[lane.serverName];
  assert.equal(server.command, brew.alias);
  assert.equal(server.args[0], path.join(rel.current, 'scripts', 'lanes.mjs'));
});

test('integrate --apply grava o alias estável e recusa BBRAINX_ENTRY que não resolve ao mesmo arquivo', { skip: !posix }, t => {
  const brew = fakeBrew(t), rel = fakeRelease(t), dir = scratch(t), project = path.join(dir, 'project'), home = path.join(dir, 'state');
  fs.mkdirSync(project); fs.writeFileSync(path.join(project, 'README.md'), '# p\n');
  const entry = path.join(rel.current, 'bin', 'bbrainx.mjs');
  run(brew.node, [entry, 'integrate', '--root', project, '--project', 'p', '--clients', 'claude', '--apply'], { BBRAINX_HOME: home });
  const server = JSON.parse(fs.readFileSync(path.join(project, '.mcp.json'), 'utf8')).mcpServers.bbrainx;
  assert.equal(server.command, brew.alias); assert.equal(server.args[0], entry);
  const wrong = spawnSync(brew.node, [entry, 'integrate', '--root', project, '--project', 'p', '--clients', 'claude'], { encoding: 'utf8', env: { PATH: process.env.PATH, BBRAINX_HOME: home, BBRAINX_ENTRY: path.join(root, 'bin', 'bbrainx.mjs') } });
  assert.equal(wrong.status, 1); assert.match(wrong.stderr, /INTEGRATION_ENTRY_MISMATCH/);
});
