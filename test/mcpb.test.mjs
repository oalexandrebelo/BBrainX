import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { getMcpConfigForManifest, vAny } from '@anthropic-ai/mcpb/browser';
import { cleanup } from './fixtures/cleanup.mjs';
import { BrainStore } from '../src/store.mjs';
import { indexProject } from '../src/retrieval.mjs';
import { stateHome } from '../src/host.mjs';
import { VERSION } from '../src/version.mjs';
import { buildStage, manifest, lockedClosure, RUNTIME_DEPENDENCIES } from '../scripts/package-mcpb.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = path.join(root, 'bin', 'bbrainx.mjs');
const require = createRequire(import.meta.url);
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

function project(t) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bb-mcpb-'))), home = path.join(base, 'home'), repo = path.join(base, 'repo');
  fs.mkdirSync(repo); fs.writeFileSync(path.join(repo, 'app.ts'), 'export function verifySession(){ return true; }\n');
  const store = new BrainStore(home); store.register('p', repo); indexProject(store, 'p'); store.close();
  cleanup(t)(() => fs.rmSync(base, { recursive: true, force: true, maxRetries: 5 }));
  return { base, home, repo };
}
/** Lança exatamente o comando que o host lançaria e lê o catálogo pelo protocolo. */
async function catalog({ command, args, env, cwd }) {
  const client = new Client({ name: 'mcpb-test', version: '1' });
  const transport = new StdioClientTransport({ command, args, env: { ...process.env, ...env }, cwd, stderr: 'pipe' });
  transport.stderr?.on('data', () => {});
  await client.connect(transport);
  try {
    const tools = (await client.listTools()).tools.map(x => x.name);
    const search = await client.callTool({ name: 'context_search', arguments: { project: 'p', query: 'verifySession', budget: 300 } });
    return { tools, version: client.getServerVersion().version, instructions: client.getInstructions() || '', search: search.structuredContent?.ok };
  } finally { await client.close(); }
}

test('mcp reads project, harness, lane, workspace and recruit from the environment when no argument is given; arguments win; empty is absent', async t => {
  const { home, repo } = project(t);
  const byEnv = await catalog({ command: process.execPath, args: [entry, 'mcp'], env: { BBRAINX_HOME: home, BBRAINX_PROJECT: 'p', BBRAINX_RECRUIT: 'true', BBRAINX_HARNESS: 'mcpb', BBRAINX_LANE: '', BBRAINX_WORKSPACE: '' }, cwd: os.tmpdir() });
  assert.equal(byEnv.tools.length, 12); assert.equal(byEnv.version, VERSION); assert.match(byEnv.instructions, /serves only project "p"/); assert.equal(byEnv.search, true);
  const off = await catalog({ command: process.execPath, args: [entry, 'mcp'], env: { BBRAINX_HOME: home, BBRAINX_PROJECT: 'p', BBRAINX_RECRUIT: 'false' }, cwd: os.tmpdir() });
  assert.equal(off.tools.length, 9);
  const argumentWins = await catalog({ command: process.execPath, args: [entry, 'mcp', '--project', 'p'], env: { BBRAINX_HOME: home, BBRAINX_PROJECT: 'nope' }, cwd: os.tmpdir() });
  assert.equal(argumentWins.search, true);
  const empty = spawnSync(process.execPath, [entry, 'mcp'], { env: { ...process.env, BBRAINX_HOME: home, BBRAINX_PROJECT: '' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(empty.status, 1); assert.equal(empty.stdout, '', 'stdout is the protocol; the refusal goes to stderr'); assert.match(empty.stderr, /PROJECT_REQUIRED/);
  assert.equal(stateHome({ BBRAINX_HOME: '' }, 'darwin'), stateHome({}, 'darwin'), 'an empty BBRAINX_HOME is the default home, never the working directory');
  assert.equal(repo.length > 0, true);
});

test('config --client cos prints the executable form with --harness cos and --recruit', t => {
  const { home } = project(t);
  const out = execFileSync(process.execPath, [entry, 'config', '--project', 'p', '--client', 'cos'], { env: { ...process.env, BBRAINX_HOME: home }, encoding: 'utf8' });
  assert.match(out, /Chat On Steroids/); assert.match(out, /"--harness",\s*"cos",\s*"--recruit"/); assert.match(out, /MCPB file/); assert.doesNotMatch(out, /api.?key|token/i);
});

test('mcp --no-recruit overrides inherited recruitment and an explicit --recruit', async t => {
  const { home } = project(t);
  for (const flags of [['--no-recruit'], ['--recruit', '--no-recruit'], ['--no-recruit', '--recruit']]) {
    const served = await catalog({ command: process.execPath, args: [entry, 'mcp', '--project', 'p', ...flags], env: { BBRAINX_HOME: home, BBRAINX_RECRUIT: 'true' }, cwd: os.tmpdir() });
    assert.equal(served.tools.length, 9); assert.ok(!served.tools.includes('agents_recruit')); assert.equal(served.search, true);
  }
});

test('lockedClosure resolves nested dependencies before root and deduplicates resolved paths', () => {
  const packages = {
    'node_modules/a': { version: '1.0.0', dependencies: { b: '^2', c: '^1' } },
    'node_modules/b': { version: '1.0.0' },
    'node_modules/a/node_modules/b': { version: '2.0.0', dependencies: { c: '^1', a: '^1' } },
    'node_modules/c': { version: '1.0.0', dependencies: { b: '^1' } }
  };
  const closure = lockedClosure({ packages }, ['a', 'b']);
  assert.equal(closure.get('node_modules/b').version, '1.0.0');
  assert.equal(closure.get('node_modules/a/node_modules/b')?.version, '2.0.0');
  assert.deepEqual([...closure.keys()].sort(), Object.keys(packages).sort());
  assert.equal(lockedClosure({ packages }, ['a']).get('node_modules/a/node_modules/b')?.version, '2.0.0');
});

test('the MCPB manifest validates, expands without leftovers and launches the bundled server with only locked runtime packages', async t => {
  const { home } = project(t);
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bb-mcpb-stage-')), 'stage');
  cleanup(t)(() => fs.rmSync(path.dirname(target), { recursive: true, force: true, maxRetries: 5 }));
  const built = buildStage({ target });
  assert.deepEqual(built.packages.slice(0, RUNTIME_DEPENDENCIES.length).map(p => p.replace('node_modules/', '')), [...RUNTIME_DEPENDENCIES]);
  for (const file of ['manifest.json', 'package.json', 'icon.png', 'bin/bbrainx.mjs', 'src/engine.mjs', 'src/recruit.mjs', 'LICENSE']) assert.ok(fs.existsSync(path.join(target, file)), file);
  assert.ok(!fs.existsSync(path.join(target, 'node_modules', 'react')), 'panel-only packages stay out');
  assert.ok(!fs.existsSync(path.join(target, 'web')) && !fs.existsSync(path.join(target, 'test')), 'no panel sources, no tests');
  const parsed = vAny.McpbManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(target, 'manifest.json'), 'utf8')));
  assert.equal(parsed.version, VERSION); assert.equal(parsed.server.type, 'node'); assert.deepEqual(manifest().user_config.project, parsed.user_config.project);
  const logger = { log() {}, warn() {}, error() {} };
  const cfg = await getMcpConfigForManifest({ manifest: parsed, extensionPath: target, systemDirs: {}, userConfig: { project: 'p', home, recruit: true, node: process.execPath }, pathSeparator: path.sep, logger });
  assert.ok(cfg && !JSON.stringify(cfg).includes('${'), 'every placeholder expanded: ' + JSON.stringify(cfg));
  assert.equal(cfg.command, process.execPath); assert.equal(cfg.args[0], path.join(target, 'bin', 'bbrainx.mjs')); assert.equal(cfg.env.BBRAINX_HARNESS, 'mcpb');
  const served = await catalog({ command: cfg.command, args: cfg.args, env: cfg.env, cwd: os.tmpdir() });
  assert.equal(served.tools.length, 12); assert.equal(served.version, VERSION); assert.equal(served.search, true);
  const defaults = await getMcpConfigForManifest({ manifest: parsed, extensionPath: target, systemDirs: {}, userConfig: { project: 'p', home, recruit: false, node: 'node' }, pathSeparator: path.sep, logger });
  assert.equal(defaults.command, 'node'); assert.equal(defaults.env.BBRAINX_RECRUIT, 'false');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.throws(() => lockedClosure(lock, ['vite']), { code: 'MCPB_DEV_DEPENDENCY' });
  assert.throws(() => lockedClosure(lock, ['not-a-package']), { code: 'MCPB_DEPENDENCY_UNLOCKED' });
});
