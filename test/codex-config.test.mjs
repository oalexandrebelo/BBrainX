import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse as parseToml } from 'smol-toml';
import * as clients from '../src/clients.mjs';

const options = project => ({ node: '/opt/homebrew/opt/node@24/bin/node', entry: '/Users/me/My Apps/app/current/bin/bbrainx.mjs', project, home: '/Users/me/Library/Application Support/BBrainX' });
const NAME = /^[A-Za-z0-9_-]+$/;   // o que `codex mcp add <nome>` aceita

// Python >= 3.11 traz tomllib. O python3 do sistema no macOS é 3.9: procura outro no PATH e nos prefixos comuns do Homebrew.
function tomllibPython() {
  const candidates = ['python3', 'python3.14', 'python3.13', 'python3.12', 'python3.11'].flatMap(name => [name, '/opt/homebrew/bin/' + name, '/usr/local/bin/' + name]);
  for (const python of candidates) {
    const probe = spawnSync(python, ['-I', '-c', 'import tomllib'], { encoding: 'utf8', timeout: 10000 });
    if (!probe.error && probe.status === 0) return python;
  }
  return null;
}
const python = tomllibPython();
function tomllib(text) {
  const r = spawnSync(python, ['-I', '-c', 'import sys, json, tomllib; print(json.dumps(tomllib.loads(sys.stdin.read())))'], { input: text, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, 'tomllib recusou a saída:\n' + r.stderr + '\n--- saída ---\n' + text);
  return JSON.parse(r.stdout);
}
// Dois leitores independentes: smol-toml (dependência do repositório) sempre; tomllib quando há Python 3.11+.
function parseBoth(text) {
  const viaSmol = JSON.parse(JSON.stringify(parseToml(text)));   // smol-toml devolve objetos sem protótipo
  if (python) assert.deepEqual(tomllib(text), viaSmol, 'tomllib e smol-toml leem o mesmo documento');
  return viaSmol;
}

test('nome do servidor Codex leva o projeto e só usa o alfabeto que `codex mcp add` aceita', () => {
  assert.equal(clients.projectServerName('app'), 'bbrainx-app');
  assert.equal(clients.projectServerName('My-Project_v2'), 'bbrainx-My-Project_v2');
  for (const project of ['a.b', 'sample.v2', 'meu app', 'x'.repeat(80), 'ação']) assert.match(clients.projectServerName(project), NAME, project);
  assert.notEqual(clients.projectServerName('a.b'), clients.projectServerName('a-b'), 'saneamento que muda o texto não pode colidir com um ID legítimo');
  assert.notEqual(clients.projectServerName('x'.repeat(80)), clients.projectServerName('x'.repeat(79)));
  assert.ok(clients.projectServerName('x'.repeat(80)).length <= 56, 'nome curto o bastante para o prefixo mcp__ do Codex');
});

test('a saída inteira de config --client codex é TOML válido, com nome por projeto', () => {
  const doc = parseBoth(clients.clientConfig('codex', options('app')));
  assert.deepEqual(Object.keys(doc.mcp_servers), ['bbrainx-app']);
  const server = doc.mcp_servers['bbrainx-app'];
  assert.equal(server.command, '/opt/homebrew/opt/node@24/bin/node');
  assert.deepEqual(server.args, ['/Users/me/My Apps/app/current/bin/bbrainx.mjs', 'mcp', '--project', 'app']);
  assert.deepEqual(server.env, { BBRAINX_HOME: '/Users/me/Library/Application Support/BBrainX' });
});

test('dois projetos geram entradas diferentes e a concatenação continua TOML válido (sem tabela duplicada)', () => {
  const merged = [clients.clientConfig('codex', options('alpha')), clients.clientConfig('codex', options('beta.v2'))].join('\n');
  const names = Object.keys(parseBoth(merged).mcp_servers);
  assert.equal(names.length, 2); assert.ok(names.every(name => NAME.test(name) && name.startsWith('bbrainx-')), names.join());
});

test('o comando `codex mcp add` fica separado: comentário "#" com o mesmo nome da tabela, nunca texto solto', () => {
  const text = clients.clientConfig('codex', options('app')), lines = text.split('\n');
  const command = lines.find(line => /codex mcp add/.test(line));
  assert.match(command, /^#\s+codex mcp add bbrainx-app --env BBRAINX_HOME='\/Users\/me\/Library\/Application Support\/BBrainX' -- \/opt\/homebrew\/opt\/node@24\/bin\/node '\/Users\/me\/My Apps\/app\/current\/bin\/bbrainx\.mjs' mcp --project app$/);
  for (const line of lines) assert.ok(line === '' || /^#/.test(line) || /^\[[^\]]+\]$/.test(line) || /^[A-Za-z_]+ = /.test(line), 'linha fora do TOML: ' + JSON.stringify(line));
  assert.match(text, /\n\[mcp_servers\.bbrainx-app\]\ncommand = /);
  assert.match(text, /global/i);
});

test('valores com caracteres de controle são recusados (não quebram o comentário nem injetam TOML)', () => {
  for (const field of ['node', 'entry', 'home', 'project'])
    assert.throws(() => clients.clientConfig('codex', { ...options('app'), [field]: '/tmp/x\n[mcp_servers.evil]' }), { code: 'INVALID_CONFIG_VALUE' }, field);
});

test('registrar o fragmento do projeto no config.toml global não apaga o de outro projeto', () => {
  const existing = '# meu config\nmodel = "gpt"\n\n' + clients.clientConfig('codex', options('alpha')) + '\n';
  const merged = existing + '\n' + clients.clientConfig('codex', options('beta'));
  const doc = parseBoth(merged);
  assert.equal(doc.model, 'gpt'); assert.deepEqual(Object.keys(doc.mcp_servers).sort(), ['bbrainx-alpha', 'bbrainx-beta']);
});
