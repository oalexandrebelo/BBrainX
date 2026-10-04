import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { ensure } from './primitives.mjs';

export function stateHome(env = process.env, platform = process.platform) {
  if (env.BBRAINX_HOME) return path.resolve(env.BBRAINX_HOME);
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'BBrainX');
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'BBrainX');
  return path.join(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'bbrainx');
}
export function safeDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  ensure(!fs.lstatSync(directory).isSymbolicLink(), 'UNSAFE_STATE_DIRECTORY');
  return fs.realpathSync(directory);
}
export function commandVersion(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 2500, maxBuffer: 65536, windowsHide: true, shell: false });
  return { available: !result.error && result.status === 0, version: result.status === 0 ? result.stdout.trim().split('\n')[0].slice(0, 180) : null };
}
/** Observa o host; não instala software, acessa Keychain ou executa arquivos do projeto. */
export function doctor() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  let sqlite = false, fts5 = false;
  const db = new DatabaseSync(':memory:');
  try { sqlite = true; db.exec('CREATE VIRTUAL TABLE probe USING fts5(text)'); fts5 = true; } finally { db.close(); }
  const git = commandVersion('git');
  const hardware = { platform: process.platform, architecture: process.arch, memoryGiB: Math.round(os.totalmem() / 1073741824), cpuCount: os.availableParallelism() };
  return {
    node: process.versions.node, supportedNode: major > 22 || (major === 22 && minor >= 20), sqlite, fts5, git,
    hardware, stateDirectory: stateHome(),
    profile: 'local-deterministic',
    optionalCandidate: process.platform === 'darwin' && process.arch === 'arm64' ? 'Apple Silicon: avaliar Laya MPS ou SemIf MLX, não ativados' : 'CPU: avaliar Laya ONNX, não ativado',
    backendBenchmarked: false, remoteProvidersEnabled: false,
    ready: (major > 22 || (major === 22 && minor >= 20)) && sqlite && fts5 && git.available,
    limits: ['Diagnóstico não mede inferência.', 'GPU, clientes e modelos não são requisitos do núcleo.', 'Não altera autenticação dos harnesses.']
  };
}
