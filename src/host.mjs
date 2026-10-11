import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { ensure } from './primitives.mjs';
import { infrastructurePlan } from './infrastructure.mjs';
import { assertLocalState, syncedStateReason, readMounts, processMounts } from './state-location.mjs';
export { assertLocalState, syncedStateReason, readMounts };

export function stateHome(env = process.env, platform = process.platform) {
  if (env.BBRAINX_HOME) return path.resolve(env.BBRAINX_HOME);
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'BBrainX');
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'BBrainX');
  return path.join(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'bbrainx');
}
const CONTROL = /[\u0000-\u001f\u007f]/;
const nativeRealpath = target => fs.realpathSync.native(target);
const sameFile = (realpath, a, b) => { try { return realpath(a) === realpath(b); } catch { return false; } };
/**
 * Executável Node para as configs emitidas. `process.execPath` no Homebrew é `.../Cellar/<fórmula>/<versão>/bin/node`, que o
 * próximo `brew upgrade` apaga; o alias `.../opt/<fórmula>/bin/node` sobrevive. O alias só é usado se resolver, por realpath,
 * ao mesmo binário em execução. BBRAINX_NODE (launcher do host) vale pela mesma prova e falha fechado se não bater.
 * `realpath` e `errors` são injetáveis (teste com caminhos fictícios; a CLI de integração mantém seus próprios códigos).
 */
export function stableNodePath({ env = process.env, execPath = process.execPath, realpath = nativeRealpath, errors = {} } = {}) {
  const invalid = errors.invalid ?? 'INVALID_NODE_PATH', mismatch = errors.mismatch ?? 'NODE_PATH_MISMATCH';
  const requested = env.BBRAINX_NODE;
  if (requested !== undefined) {
    const invalidMessage = 'BBRAINX_NODE precisa ser o caminho absoluto de um executável existente.';
    ensure(typeof requested === 'string' && path.isAbsolute(requested) && !CONTROL.test(requested), invalid, invalidMessage);
    try { realpath(requested); } catch { ensure(false, invalid, invalidMessage); }
    ensure(sameFile(realpath, requested, execPath), mismatch, 'BBRAINX_NODE precisa resolver (realpath) ao mesmo executável deste processo; use o alias estável do Node que está rodando o BBrainX.');
    return requested;
  }
  const keg = /^(.*)\/Cellar\/([^/]+)\/[^/]+\/bin\/node$/.exec(execPath);
  if (keg) { const alias = keg[1] + '/opt/' + keg[2] + '/bin/node'; if (sameFile(realpath, alias, execPath)) return alias; }
  return execPath;
}
/**
 * Arquivo de entrada para as configs emitidas. Node resolve symlinks do módulo principal, então um processo iniciado por
 * `app/current/bin/bbrainx.mjs` enxerga `app/releases/<sha>/bin/bbrainx.mjs`; gravar isso fixaria a release e o prune a quebraria.
 * Prefere BBRAINX_ENTRY (se resolver ao mesmo arquivo) ou o espelho `app/current/...` (se resolver ao mesmo arquivo).
 */
export function stableEntryPath(selfPath, { env = process.env, realpath = nativeRealpath, errors = {} } = {}) {
  const invalid = errors.invalid ?? 'INVALID_ENTRY_PATH', mismatch = errors.mismatch ?? 'ENTRY_PATH_MISMATCH';
  const requested = env.BBRAINX_ENTRY;
  if (requested !== undefined && requested !== '') {
    const invalidMessage = 'BBRAINX_ENTRY precisa ser o caminho absoluto de um arquivo existente.';
    ensure(typeof requested === 'string' && path.isAbsolute(requested) && !CONTROL.test(requested), invalid, invalidMessage);
    try { realpath(requested); } catch { ensure(false, invalid, invalidMessage); }
    ensure(sameFile(realpath, requested, selfPath), mismatch, 'BBRAINX_ENTRY precisa resolver (realpath) ao mesmo arquivo em execução; aponte para app/current dentro da mesma release.');
    return requested;
  }
  const parts = selfPath.split(path.sep), at = parts.lastIndexOf('releases');
  if (at > 0 && at + 2 < parts.length) {
    const current = [...parts.slice(0, at), 'current', ...parts.slice(at + 2)].join(path.sep);
    if (sameFile(realpath, current, selfPath)) return current;
  }
  return selfPath;
}
export function safeDirectory(directory) {
  assertLocalState(directory);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  ensure(!fs.lstatSync(directory).isSymbolicLink(), 'UNSAFE_STATE_DIRECTORY');
  return fs.realpathSync(directory);
}
export function commandVersion(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 2500, maxBuffer: 65536, windowsHide: true, shell: false });
  return { available: !result.error && result.status === 0, version: result.status === 0 ? result.stdout.trim().split('\n')[0].slice(0, 180) : null };
}
/**
 * Commit e ramo vistos pelo host; nunca vêm de argumento de ferramenta. null fora de um repositório com commit.
 * Só `rev-parse`: `git status` e `git diff` executam os filtros `clean` configurados no repositório.
 */
export function gitState(root) {
  const options = { encoding: 'utf8', timeout: 5000, maxBuffer: 65536, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'] };
  const head = spawnSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', root, 'rev-parse', 'HEAD', '--abbrev-ref', 'HEAD'], options);
  if (head.error || head.status !== 0) return null;
  const [commit, branch] = head.stdout.trim().split('\n');
  return { head: commit, branch: branch || null };
}
/** Piso do produto: primeira linha 22 com node:sqlite e FTS5 verificada pela CI (job de piso); Node 24 LTS é o recomendado. */
export const MINIMUM_NODE = '22.20.0';
export function nodeSupported(version) {
  const parts = String(version).split('.').map(Number), floor = MINIMUM_NODE.split('.').map(Number);
  if (parts.length !== 3 || !parts.every(Number.isInteger)) return false;
  for (let i = 0; i < 3; i++) if (parts[i] !== floor[i]) return parts[i] > floor[i];
  return true;
}
/** Observa o host; não instala software, acessa Keychain ou executa arquivos do projeto. `nodeVersion`, `env` e `mounts` são injetáveis. */
export function doctor({ nodeVersion = process.versions.node, env = process.env, mounts = processMounts } = {}) {
  const supportedNode = nodeSupported(nodeVersion);
  let sqlite = false, fts5 = false;
  const db = new DatabaseSync(':memory:');
  try { sqlite = true; db.exec('CREATE VIRTUAL TABLE probe USING fts5(text)'); fts5 = true; } finally { db.close(); }
  const git = commandVersion('git');
  const syncReason = env.BBRAINX_ALLOW_SYNCED_HOME === '1' ? null : syncedStateReason(stateHome(env), { mounts });
  const stateSync = { local: syncReason === null, reason: syncReason };
  const hardware = { platform: process.platform, architecture: process.arch, memoryGiB: Math.round(os.totalmem() / 1073741824), cpuCount: os.availableParallelism() };
  const infrastructure = infrastructurePlan({totalMemoryBytes:os.totalmem(),cpuCount:hardware.cpuCount,constrainedMemoryBytes:process.constrainedMemory?.() ?? 0});
  const blockers = [];
  if (!supportedNode) blockers.push('Node ' + nodeVersion + ' não é suportado: instale o Node 24 LTS (https://nodejs.org ou `brew install node@24`) e rode o comando com ele. Mínimo: ' + MINIMUM_NODE + '.');
  if (!sqlite || !fts5) blockers.push('Este Node não traz node:sqlite com FTS5: use o Node 24 LTS oficial ou do Homebrew.');
  if (!git.available) blockers.push('Git não encontrado: instale o Git (macOS: `xcode-select --install` ou `brew install git`).');
  if (!stateSync.local) blockers.push('BBRAINX_HOME está em ' + stateSync.reason + ': use um disco local (veja STATE_HOME_SYNCED em docs/QUICKSTART.md) ou BBRAINX_ALLOW_SYNCED_HOME=1 por sua conta e risco.');
  return {
    node: nodeVersion, minimumNode: MINIMUM_NODE, supportedNode, sqlite, fts5, git,
    hardware, infrastructure, stateDirectory: stateHome(env), stateSync,
    profile: 'local-deterministic',
    optionalCandidate: process.platform === 'darwin' && process.arch === 'arm64' ? 'Apple Silicon: avaliar Laya MPS ou SemIf MLX, não ativados' : 'CPU: avaliar Laya ONNX, não ativado',
    backendBenchmarked: false, remoteProvidersEnabled: false,
    ready: blockers.length === 0, blockers,
    limits: ['Diagnóstico não mede inferência.', 'GPU, clientes e modelos não são requisitos do núcleo.', 'Não altera autenticação dos harnesses.', 'Perfil de infraestrutura é recomendação; não aplica limite global de RSS.']
  };
}
