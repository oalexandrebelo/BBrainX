import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { clientConfig, CLIENTS } from '../src/clients.mjs';
import { laneConfig } from '../src/lanes/clients.mjs';
import { laneFixture } from './fixtures/lane-setup.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = t => { const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bbrainx-agy-'))); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const options = { node: '/opt/homebrew/opt/node@24/bin/node', entry: '/Users/me/app/current/bin/bbrainx.mjs', project: 'meu.app', home: '/Users/me/Library/Application Support/BBrainX' };
const jsonOf = text => JSON.parse(text.slice(text.indexOf('{')));
const USER_FILE = ['.gemini', 'config', 'mcp_config.json'];

test('Antigravity é um cliente conhecido e o destino é o arquivo de usuário ~/.gemini/config/mcp_config.json, forma mcpServers', () => {
  assert.ok(CLIENTS.includes('antigravity'));
  const text = clientConfig('antigravity', options), config = jsonOf(text);
  assert.match(text, /~\/\.gemini\/config\/mcp_config\.json/);
  assert.doesNotMatch(text, /cole em \.agents\/mcp_config\.json/, 'o arquivo de workspace não é lido pelo agy nem foi descoberto pelo IDE 2.5.5');
  assert.deepEqual(Object.keys(config), ['mcpServers']);
  const [name] = Object.keys(config.mcpServers);
  assert.match(name, /^bbrainx-meu-app-[0-9a-f]{6}$/, 'escopo de usuário: o nome leva o projeto para dois projetos não se sobrescreverem');
  assert.deepEqual(config.mcpServers[name], { command: options.node, args: [options.entry, 'mcp', '--project', 'meu.app'], env: { BBRAINX_HOME: options.home } });
  assert.match(text, /usu[aá]rio/i); assert.match(text, /--project/);
});

test('bbrainx config --client antigravity funciona, só imprime e não toca no HOME', t => {
  const home = scratch(t), state = path.join(scratch(t), 'state');
  const r = spawnSync(process.execPath, [path.join(root, 'bin', 'bbrainx.mjs'), 'config', '--project', 'p', '--client', 'antigravity'],
    { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, BBRAINX_HOME: state } });
  assert.equal(r.status, 0, r.stderr); assert.doesNotMatch(r.stderr, /UNKNOWN_CLIENT/);
  assert.ok(jsonOf(r.stdout).mcpServers['bbrainx-p']);
  assert.deepEqual(fs.readdirSync(home), [], 'nenhum arquivo é criado no HOME (nem em ~/.gemini)');
});

const binding = { project: 'product', id: 'alpha', root: '/work/alpha' };
for (const client of ['antigravity', 'antigravity-cli'])
  test('lane config de ' + client + ' aponta para o arquivo de usuário e declara o escopo', t => {
    const userHome = scratch(t), result = laneConfig(client, { node: options.node, entry: '/app/current/scripts/lanes.mjs', home: options.home, binding, userHome });
    assert.equal(result.destination, path.join(userHome, ...USER_FILE));
    assert.equal(result.scope, 'user');
    assert.deepEqual(Object.keys(result.fragment), ['mcpServers']);
    assert.deepEqual(result.fragment.mcpServers[result.serverName].args.slice(-6), ['--project', 'product', '--lane', 'alpha', '--workspace', '/work/alpha']);
    assert.equal(result.writesConfiguration, false); assert.equal(result.workspace, binding.root);
    assert.match(result.note, /usu[aá]rio/i);
    assert.deepEqual(fs.readdirSync(userHome), [], 'só imprime');
  });

test('os outros clientes de lane continuam com destino relativo à worktree e escopo workspace', () => {
  for (const [client, destination] of [['claude', '.mcp.json'], ['cursor', '.cursor/mcp.json'], ['vscode', '.vscode/mcp.json'], ['codex', '.codex/config.toml']]) {
    const result = laneConfig(client, { node: options.node, entry: '/app/lanes.mjs', home: options.home, binding });
    assert.equal(result.destination, destination, client); assert.equal(result.scope, 'workspace', client);
  }
});

test('scripts/lanes.mjs config --client antigravity resolve o destino pelo HOME do processo', t => {
  const f = laneFixture(t), home = scratch(t);
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'lanes.mjs'), 'config', '--project', 'product', '--lane', 'alpha', '--client', 'antigravity'],
    { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, BBRAINX_HOME: f.home } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).destination, path.join(home, ...USER_FILE));
  assert.deepEqual(fs.readdirSync(home), []);
  assert.equal(fs.existsSync(path.join(f.alpha, '.agents')), false, 'nada é gravado na worktree');
});
