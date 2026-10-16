import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BrainStore } from '../src/store.mjs';
import { makeEngine } from '../src/engine.mjs';
import { observeEngine } from '../src/control.mjs';
import { runChecks, previewAction, runAction, openTerminal, formatSummary } from '../src/check.mjs';
import { startCheckServer } from '../src/check-server.mjs';

const entry = fileURLToPath(new URL('../bin/bbrainx.mjs', import.meta.url));
// Tudo isolado: estado, pasta de necessidades, Codex e HOME temporários; nada do computador real é lido ou gravado.
function sandbox(t) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bb-check-')));
  const home = path.join(base, 'state'), root = path.join(base, 'repo'), user = path.join(base, 'home'), codex = path.join(base, 'codex');
  for (const dir of [root, user, codex, path.join(user, '.local', 'bin')]) fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  fs.writeFileSync(path.join(root, 'app.ts'), 'export const a = 1;\n');
  const saved = Object.fromEntries(['HOME', 'CODEX_HOME', 'BBRAINX_FILES_ROOT', 'BBRAINX_HOME'].map(k => [k, process.env[k]]));
  Object.assign(process.env, { HOME: user, CODEX_HOME: codex, BBRAINX_FILES_ROOT: path.join(base, 'Downloads', 'Projetos'), BBRAINX_HOME: home });
  const store = new BrainStore(home);
  t.after(() => { store.close(); for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; fs.rmSync(base, { recursive: true, force: true }); });
  return { base, home, root, user, codex, store };
}
const integrateCli = (s, ...extra) => { const r = spawnSync(process.execPath, [entry, 'integrate', '--root', s.root, '--project', 'p', '--clients', 'claude,codex,vscode', ...extra], { cwd: s.root, encoding: 'utf8', env: process.env, timeout: 30000 }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
const find = (report, id) => report.groups.flatMap(g => g.items).find(i => i.id === id);

test('checks report machine, harness and per-project state in plain words, with closed actions', async t => {
  const s = sandbox(t);
  s.store.register('p', s.root);
  const report = await runChecks(s.store);
  assert.deepEqual(Object.keys(report.summary), ['ok', 'warn', 'fail', 'manual']);
  assert.equal(find(report, 'machine.files').status, 'warn');
  assert.deepEqual(find(report, 'machine.files').actions.map(a => a.id), ['files-setup']);
  assert.equal(find(report, 'project.p.claude'), undefined, 'pending clients are grouped in one item');
  const integrate = find(report, 'project.p.integrate');
  assert.equal(integrate.title, 'Configurar harnesses');assert.match(integrate.detail, /Ainda sem configuração: .*Claude Code/);
  assert.deepEqual(integrate.actions, [{ id: 'integrate', label: 'Ver o que muda', kind: 'write', params: { project: 'p' } }]);
  const antigravity = find(report, 'project.p.antigravity');
  if (antigravity) { assert.equal(antigravity.status, 'manual');assert.deepEqual(antigravity.actions.map(a => a.kind), ['copy', 'hide']);assert.equal(antigravity.tag, 'antigravity'); }
  assert.equal(find(report, 'project.p.connections').status, 'manual', 'no harness ever connected');
  assert.match(formatSummary(report), /manual integrador/);
});

test('a write shows the diff first, applies only the previewed plan, and can be undone', async t => {
  const s = sandbox(t);
  s.store.register('p', s.root);
  await assert.rejects(runAction(s.store, 'integrate', { project: 'p' }), { code: 'CHECK_PREVIEW_REQUIRED' });
  const preview = previewAction(s.store, 'integrate', { project: 'p' });
  const claudeDiff = preview.changes.find(c => c.client === 'claude');
  assert.equal(claudeDiff.status, 'create');assert(claudeDiff.diff.some(l => l.op === '+' && /"bbrainx"/.test(l.text)));
  // Alguém mexe num arquivo depois da prévia: a aplicação recusa, nada é gravado.
  fs.writeFileSync(path.join(s.root, '.mcp.json'), '{"mcpServers":{}}\n');
  await assert.rejects(runAction(s.store, 'integrate', { project: 'p' }, { planId: preview.planId }), { code: 'CHECK_PLAN_CHANGED' });
  assert.equal(fs.readFileSync(path.join(s.root, '.mcp.json'), 'utf8'), '{"mcpServers":{}}\n');
  const fresh = previewAction(s.store, 'integrate', { project: 'p' });
  const applied = await runAction(s.store, 'integrate', { project: 'p' }, { planId: fresh.planId });
  assert.match(applied.receipt, /^[a-f0-9-]{36}$/);
  assert.match(fs.readFileSync(path.join(s.root, '.mcp.json'), 'utf8'), /"--recruit"/);
  const after = await runChecks(s.store);
  for (const client of ['claude', 'codex', 'vscode']) assert.equal(find(after, 'project.p.' + client).status, 'ok', client);
  const undo = previewAction(s.store, 'rollback', { receipt: applied.receipt });
  await runAction(s.store, 'rollback', { receipt: applied.receipt }, { planId: undo.planId });
  assert.equal(fs.readFileSync(path.join(s.root, '.mcp.json'), 'utf8'), '{"mcpServers":{}}\n', 'undo restores what was there');
});

test('Codex trust, recorded connections and a blocked foreign entry are reported, never changed', async t => {
  const s = sandbox(t);
  s.store.register('p', s.root);
  integrateCli(s, '--apply');
  assert.equal(find(await runChecks(s.store), 'project.p.trust').status, 'manual');
  fs.writeFileSync(path.join(s.codex, 'config.toml'), '[projects."' + s.root + '"]\ntrust_level = "trusted"\n');
  assert.equal(find(await runChecks(s.store), 'project.p.trust').status, 'ok');
  // Uma sessão MCP do Claude Code registrada prova que o servidor foi aprovado.
  const observed = observeEngine(makeEngine(s.store, ['p']), s.store, { project: 'p', harness: 'claude', workspace: s.root });observed.connected();
  t.after(() => observed.close());
  const connections = find(await runChecks(s.store), 'project.p.connections');
  assert.equal(connections.status, 'ok');assert.match(connections.detail, /Claude Code conectado agora/);
  // Outro projeto com uma entrada "bbrainx" escrita à mão: bloqueado, com o passo a passo, e o arquivo continua intacto.
  const other = path.join(s.base, 'other');fs.mkdirSync(other);execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: other });
  const foreign = JSON.stringify({ mcpServers: { bbrainx: { command: 'other-tool', args: ['serve'] } } }) + '\n';
  fs.writeFileSync(path.join(other, '.mcp.json'), foreign);s.store.register('q', other);
  const blocked = find(await runChecks(s.store), 'project.q.claude');
  assert.equal(blocked.status, 'fail');assert.match(blocked.detail, /INTEGRATION_SERVER_COLLISION/);assert.match(blocked.guide, /não foi gravada pelo BBrainX/);
  assert.deepEqual(blocked.actions.map(x => x.id), ['open-file']);
  assert.equal(previewAction(s.store, 'integrate', { project: 'q' }).blocked[0].reason, 'INTEGRATION_SERVER_COLLISION');
  assert.equal(fs.readFileSync(path.join(other, '.mcp.json'), 'utf8'), foreign);
});

test('the bbx shortcut and the needs folder are created only after their preview', async t => {
  const s = sandbox(t);
  fs.writeFileSync(path.join(s.user, '.local', 'bin', 'bbrainx'), '#!/bin/sh\nexec node /x/bbrainx.mjs "$@"\n', { mode: 0o755 });
  assert.equal(find(await runChecks(s.store), 'machine.bbx').status, 'warn');
  const shortcut = previewAction(s.store, 'shortcut');
  await runAction(s.store, 'shortcut', {}, { planId: shortcut.planId });
  const bbx = path.join(s.user, '.local', 'bin', 'bbx');
  assert.equal(fs.readFileSync(bbx, 'utf8'), fs.readFileSync(path.join(s.user, '.local', 'bin', 'bbrainx'), 'utf8'));assert.equal(fs.statSync(bbx).mode & 0o111, 0o111);
  const folder = previewAction(s.store, 'files-setup');
  const made = await runAction(s.store, 'files-setup', {}, { planId: folder.planId });
  assert.equal(made.project, 'projetos');assert(fs.existsSync(process.env.BBRAINX_FILES_ROOT));
});

test('terminal actions are a fixed list; the command is built with safe quoting for each system', async t => {
  const s = sandbox(t);
  s.store.register('p', s.root);
  await assert.rejects(runAction(s.store, 'terminal', { command: 'rm -rf /' }), { code: 'CHECK_ACTION_UNKNOWN' });
  await assert.rejects(runAction(s.store, 'nope', {}), { code: 'CHECK_ACTION_UNKNOWN' });
  const calls = [], spawner = (cmd, args) => { calls.push([cmd, args]); return { on() {}, unref() {} }; };
  const mac = openTerminal(['claude'], "/tmp/it's here", { platform: 'darwin', spawner });
  assert.equal(mac.command, "cd '/tmp/it'\\''s here' && 'claude'");
  assert.equal(calls[0][0], '/usr/bin/osascript');assert.match(calls[0][1][3], /do script "cd '\/tmp\/it'\\\\''s here' && 'claude'"/);
  openTerminal(['codex', 'login'], undefined, { platform: 'win32', spawner });
  assert.deepEqual(calls[1], ['cmd.exe', ['/c', 'start', '""', 'cmd', '/k', 'codex login']]);
});

test('the page server: token in the fragment, local host and origin only, nonce CSP, closed actions', async t => {
  const s = sandbox(t);
  s.store.register('p', s.root);
  const page = await startCheckServer(s.store, { idleMs: 60000 });t.after(() => page.close());
  const base = 'http://127.0.0.1:' + page.port, token = page.url.split('#')[1];
  assert.equal(page.url, base + '/#' + token, 'the token travels in the fragment, never in the request');
  const html = await fetch(base + '/');
  const csp = html.headers.get('content-security-policy'), body = await html.text();
  assert.match(csp, /script-src 'nonce-[A-Za-z0-9+/=]+'/);assert(!body.includes(token));assert(!body.includes('__NONCE__'));
  assert.equal((await fetch(base + '/api/checks')).status, 401);
  const checks = await fetch(base + '/api/checks', { headers: { 'x-bbx-token': token } });
  assert.equal(checks.status, 200);assert.equal((await checks.json()).schemaVersion, 1);
  const post = (route, body, origin = base) => fetch(base + route, { method: 'POST', headers: { 'x-bbx-token': token, 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
  assert.equal((await post('/api/run', { action: 'index', params: { project: 'p' } }, 'https://evil.example')).status, 403);
  const unknown = await post('/api/run', { action: 'terminal', params: { command: 'sh' } });
  assert.equal(unknown.status, 409);assert.equal((await unknown.json()).error, 'CHECK_ACTION_UNKNOWN');
  const preview = await post('/api/preview', { action: 'integrate', params: { project: 'p' } });
  assert.equal(preview.status, 200);assert.match((await preview.json()).planId, /^[0-9a-f]{64}$/);
  const rebound = await new Promise(resolve => { const req = http.request({ host: '127.0.0.1', port: page.port, path: '/api/checks', headers: { host: 'evil.example', 'x-bbx-token': token } }, res => resolve(res.statusCode)); req.end(); });
  assert.equal(rebound, 400, 'DNS rebinding: a foreign Host is refused');
  assert.equal((await post('/api/close', { action: 'close' })).status, 200);
  await new Promise(r => setTimeout(r, 120));assert.equal(page.closed(), true);
});

test('bbx ch from the chat: the MCP tool returns the summary and a working link; the CLI prints the same report', async t => {
  const s = sandbox(t);
  s.store.register('p', s.root);
  const engine = makeEngine(s.store, ['p']);
  const result = await engine.invoke('bbx.check', { project: 'p' }, { principal: { id: 'host' } });
  assert.equal(result.ok, true, JSON.stringify(result));
  const { url, summary, attention } = result.data;
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/#[A-Za-z0-9_-]+$/);assert.equal(typeof summary.ok, 'number');assert(attention.length > 0);
  const [base, token] = url.split('/#');
  const res = await fetch(base + '/api/checks', { headers: { 'x-bbx-token': token } });
  assert.equal(res.status, 200);
  await fetch(base + '/api/close', { method: 'POST', headers: { 'x-bbx-token': token, 'content-type': 'application/json', origin: base }, body: '{"action":"close"}' });
  const cli = spawnSync(process.execPath, [entry, 'ch', '--json'], { encoding: 'utf8', env: process.env, timeout: 30000 });
  assert.equal(cli.status, 0, cli.stderr);assert.equal(JSON.parse(cli.stdout).groups[0].id, 'machine');
});
