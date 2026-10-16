#!/usr/bin/env node
/**
 * Empacota o BBrainX como bundle MCPB (manifest 0.3) para hosts que instalam servidores MCP por bundle
 * (Chat On Steroids, Claude Desktop). O host expande `${__dirname}` e `${user_config.*}` e lança
 * `node bin/bbrainx.mjs mcp` com BBRAINX_PROJECT/BBRAINX_HOME/BBRAINX_RECRUIT no ambiente (bin/bbrainx.mjs).
 *
 * Sem rede: as dependências de execução vêm do node_modules já instalado, pelo fecho transitivo do
 * package-lock.json, nas versões exatas. Só o que o comando `mcp` importa entra (o painel web fica de fora).
 * Saída: artifacts/bbrainx-<versão>.mcpb e artifacts/bbrainx-<versão>.mcpb.sha256. `--stage-only` monta a
 * pasta artifacts/mcpb/stage sem empacotar (os testes conferem a pasta e o manifesto).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/version.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const stageOnly = process.argv.includes('--stage-only');
const stage = path.join(root, 'artifacts', 'mcpb', 'stage');
/** O que `bin/bbrainx.mjs mcp` importa em execução. react, react-dom e @xyflow/react servem só ao painel. */
export const RUNTIME_DEPENDENCIES = Object.freeze(['zod', 'gpt-tokenizer', 'jsonc-parser', 'smol-toml']);

export function manifest(version = VERSION) {
  return {
    manifest_version: '0.3',
    name: 'bbrainx',
    display_name: 'BBrainX',
    version,
    description: 'Verified repository context, checkpoints and human-approved memory for one project; optional recruitment of Claude Code and Codex agents.',
    long_description: 'BBrainX keeps a local, verified index of one registered project and serves bounded context packs, task checkpoints and memory a human approved. With Recruit agents on, it can launch the Claude Code and Codex CLIs already logged in on this computer, each in its own git worktree. No network calls, no credentials read.',
    author: { name: 'Alexandre Belo', url: 'https://github.com/oalexandrebelo' },
    repository: { type: 'git', url: 'https://github.com/oalexandrebelo/BBrainX' },
    homepage: 'https://github.com/oalexandrebelo/BBrainX',
    documentation: 'https://github.com/oalexandrebelo/BBrainX/blob/main/docs/QUICKSTART.md',
    license: 'MIT',
    icon: 'icon.png',
    keywords: ['context', 'memory', 'checkpoint', 'code-search', 'agents', 'codex', 'claude-code'],
    server: {
      type: 'node',
      entry_point: 'bin/bbrainx.mjs',
      mcp_config: {
        command: '${user_config.node}',
        args: ['${__dirname}/bin/bbrainx.mjs', 'mcp'],
        env: { BBRAINX_PROJECT: '${user_config.project}', BBRAINX_HOME: '${user_config.home}', BBRAINX_RECRUIT: '${user_config.recruit}', BBRAINX_HARNESS: 'mcpb' }
      }
    },
    tools: [
      { name: 'context_bootstrap', description: 'Bounded context pack with verified source hashes for an objective; resumes a checkpoint.' },
      { name: 'context_search', description: 'Search the project; declarations rank above usages and tests; capped by a token budget.' },
      { name: 'context_read', description: 'Read a bounded numbered window from an indexed file, with a verified hash.' },
      { name: 'context_symbol', description: 'Find exact lexical declarations with file, line, kind and a verified hash.' },
      { name: 'context_index', description: 'Refresh or inspect the worktree index.' },
      { name: 'session_get', description: 'Read a task checkpoint.' },
      { name: 'session_checkpoint', description: 'Save a task checkpoint with what was done, decisions, files and evidence.' },
      { name: 'memory_propose', description: 'Propose a memory; a human approves it in the CLI.' },
      { name: 'agents_recruit', description: 'With Recruit agents on: run Claude Code or Codex agents in their own worktrees.' },
      { name: 'agents_status', description: 'With Recruit agents on: state, commits, usage and report of each recruit.' },
      { name: 'agents_dismiss', description: 'With Recruit agents on: remove a recruit worktree; the branch stays.' }
    ],
    compatibility: { platforms: ['darwin', 'linux', 'win32'], runtimes: { node: '>=22.20.0' } },
    user_config: {
      project: { type: 'string', title: 'Project id', description: 'The id registered with `bbrainx integrate --root <folder> --apply`. One installation serves one project.', required: true },
      home: { type: 'directory', title: 'State directory', description: 'BBRAINX_HOME. Leave empty for the default location of this computer.', required: false, default: '' },
      recruit: { type: 'boolean', title: 'Recruit agents', description: 'Expose agents_recruit, agents_status and agents_dismiss: Claude Code and Codex CLIs already logged in on this computer run tasks in their own git worktrees.', required: false, default: false },
      node: { type: 'file', title: 'Node.js executable', description: 'Node 22.20 or newer with SQLite FTS5. Leave "node" to use the host’s PATH.', required: false, default: 'node' }
    }
  };
}

/** Fecho transitivo pelo lockfile: só pacotes instalados em node_modules, nas versões travadas. */
export function lockedClosure(lock, names) {
  const packages = lock.packages, seen = new Map(), queue = names.map(name => ['node_modules/' + name, null]);
  while (queue.length) {
    const [key, from] = queue.shift();
    let resolved = key;
    // Resolução Node: dependência aninhada primeiro, depois o nível acima, até a raiz.
    if (from) { let base = from; while (base) { const nested = base + '/' + key; if (packages[nested]) { resolved = nested; break; } base = base.includes('/node_modules/') ? base.slice(0, base.lastIndexOf('/node_modules/')) : ''; } }
    if (seen.has(resolved)) continue;
    const entry = packages[resolved];
    if (!entry) throw Object.assign(new Error('Pacote fora do lockfile: ' + key), { code: 'MCPB_DEPENDENCY_UNLOCKED' });
    if (entry.dev || entry.optional && !entry.dependencies) { if (entry.dev) throw Object.assign(new Error('Dependência de desenvolvimento no bundle: ' + key), { code: 'MCPB_DEV_DEPENDENCY' }); }
    seen.set(resolved, entry);
    for (const dependency of Object.keys(entry.dependencies ?? {})) queue.push(['node_modules/' + dependency, resolved]);
  }
  return seen;
}

function copyTree(from, to, filter = () => true) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name), target = path.join(to, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) { if (filter(source, true)) copyTree(source, target, filter); }
    else if (entry.isFile() && filter(source, false)) fs.copyFileSync(source, target);
  }
}

export function buildStage({ target = stage, version = VERSION } = {}) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  const notNodeModules = source => path.basename(source) !== 'node_modules';
  copyTree(path.join(root, 'bin'), path.join(target, 'bin'), notNodeModules);
  copyTree(path.join(root, 'src'), path.join(target, 'src'), notNodeModules);
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) if (fs.existsSync(path.join(root, file))) fs.copyFileSync(path.join(root, file), path.join(target, file));
  fs.copyFileSync(path.join(root, 'public', 'brand', 'icon-128.png'), path.join(target, 'icon.png'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const closure = lockedClosure(lock, RUNTIME_DEPENDENCIES);
  for (const [key] of closure) copyTree(path.join(root, key), path.join(target, key), source => path.basename(source) !== 'node_modules' || !fs.statSync(source).isDirectory());
  const dependencies = Object.fromEntries(RUNTIME_DEPENDENCIES.map(name => [name, pkg.dependencies[name]]));
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: 'bbrainx', version, type: 'module', private: true, license: 'MIT', dependencies }, null, 2) + '\n');
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest(version), null, 2) + '\n');
  return { stage: target, packages: [...closure.keys()] };
}

function pack(target, version) {
  const out = path.join(root, 'artifacts', 'bbrainx-' + version + '.mcpb');
  fs.rmSync(out, { force: true });
  const cli = path.join(root, 'node_modules', '@anthropic-ai', 'mcpb', 'dist', 'cli', 'cli.js');
  execFileSync(process.execPath, [cli, 'pack', target, out], { stdio: ['ignore', 'inherit', 'inherit'], timeout: 120000 });
  const bytes = fs.readFileSync(out), sha256 = createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(out + '.sha256', sha256 + '  ' + path.basename(out) + '\n');
  return { file: out, bytes: bytes.length, sha256 };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const built = buildStage();
  if (stageOnly) console.log(JSON.stringify({ stage: built.stage, packages: built.packages.length }));
  else console.log(JSON.stringify({ ...pack(built.stage, VERSION), packages: built.packages.length }));
}
