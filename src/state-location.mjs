import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensure } from './primitives.mjs';

// Pastas que um sincronizador replica ARQUIVO A ARQUIVO levam o brain.sqlite sem o -wal/-shm (commits somem) ou criam
// "brain 2.sqlite"; duas máquinas escrevendo divergem. Volumes de rede não suportam a memória compartilhada do WAL.
const SYNC_SEGMENTS = new Set(['mobile documents', 'cloudstorage', 'com~apple~clouddocs', 'icloud drive', 'dropbox', 'onedrive', 'google drive', 'googledrive', 'box sync', 'pcloud drive', 'nextcloud', 'syncthing']);
const SYNC_PREFIX = /^(onedrive|googledrive)[- ]|^dropbox \(/i;
const REMOTE_FILESYSTEMS = new Set(['smbfs', 'smb3', 'cifs', 'nfs', 'nfs4', 'afpfs', 'webdav', 'davfs', 'sshfs', 'rclone', 'macfuse', 'osxfuse', 'fuse-t', '9p', 'ceph', 'glusterfs', 'lustre', 'afs']);
export function readMounts(platform = process.platform) {
  try {
    if (platform === 'linux') return fs.readFileSync('/proc/self/mounts', 'utf8').split('\n').map(line => line.split(' ')).filter(f => f.length > 2)
      .map(f => ({ point: f[1].replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8))), type: f[2] }));
    if (platform === 'darwin') {
      const r = spawnSync('/sbin/mount', [], { encoding: 'utf8', timeout: 2500, maxBuffer: 1 << 20, shell: false });
      return r.status === 0 ? r.stdout.split('\n').map(line => /^.+? on (.+) \(([\w-]+)[,)]/.exec(line)).filter(Boolean).map(m => ({ point: m[1], type: m[2] })) : [];
    }
  } catch { /* sem tabela de montagem: só a checagem por nome vale */ }
  return [];
}
let mountTable;
export const processMounts = () => mountTable ??= readMounts();
/** Caminho absoluto com o ancestral existente mais profundo resolvido por realpath (symlinks), sem criar nada. */
export function resolveExisting(directory) {
  const rest = [];
  for (let current = path.resolve(directory); ;) {
    try { return path.join(fs.realpathSync.native(current), ...rest); } catch { /* sobe até um ancestral que exista */ }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(directory);
    rest.unshift(path.basename(current)); current = parent;
  }
}
function lexicalReason(directory, mounts, platform) {
  const flavour = platform === 'win32' ? path.win32 : path.posix;
  const resolved = flavour.resolve(directory);
  if (platform === 'win32' && /^\\\\(?![?.]\\)/.test(resolved)) return 'sistema de arquivos remoto (caminho UNC ' + resolved.split('\\').slice(0, 4).join('\\') + ')';
  const hit = resolved.split(flavour.sep).find(part => SYNC_SEGMENTS.has(part.toLowerCase()) || SYNC_PREFIX.test(part));
  if (hit) return 'pasta de sincronização (' + hit + ')';
  return mountReason(resolved, mounts, flavour);
}
function mountReason(resolved, mounts, flavour) {
  let best = null;
  for (const mount of mounts()) {
    const base = mount.point.endsWith(flavour.sep) ? mount.point : mount.point + flavour.sep;
    if ((resolved === mount.point || (resolved + flavour.sep).startsWith(base)) && (!best || mount.point.length > best.point.length)) best = mount;
  }
  return best && REMOTE_FILESYSTEMS.has(best.type.replace(/^fuse\./, '')) ? 'sistema de arquivos remoto (' + best.type + ' em ' + best.point + ')' : null;
}
/** Só volume de rede ou UNC (pasta sincronizada é aceita): para pastas de usuário como Downloads, onde não há banco WAL. */
export function remoteFilesystemReason(directory, { mounts = processMounts, platform = process.platform } = {}) {
  const flavour = platform === 'win32' ? path.win32 : path.posix, resolved = flavour.resolve(platform === process.platform ? resolveExisting(directory) : directory);
  if (platform === 'win32' && /^\\\\(?![?.]\\)/.test(resolved)) return 'sistema de arquivos remoto (caminho UNC)';
  return mountReason(resolved, mounts, flavour);
}
/**
 * null se o diretório parece local; senão a razão. Confere o caminho digitado e, no host real, também o resolvido por realpath
 * (um symlink de ancestral para iCloud/Dropbox). `mounts` e `platform` são injetáveis para teste. Não cria nada.
 */
export function syncedStateReason(directory, { mounts = processMounts, platform = process.platform } = {}) {
  return lexicalReason(directory, mounts, platform) ?? (platform === process.platform ? lexicalReason(resolveExisting(directory), mounts, platform) : null);
}
/** Recusa BBRAINX_HOME sincronizado ou em rede, tanto pelo caminho digitado quanto pelo resolvido; antes de criar pasta ou banco. */
export function assertLocalState(directory, { env = process.env, mounts = processMounts, platform = process.platform } = {}) {
  if (env.BBRAINX_ALLOW_SYNCED_HOME === '1') return;
  const reason = syncedStateReason(directory, { mounts, platform });
  ensure(!reason, 'STATE_HOME_SYNCED', 'BBRAINX_HOME aponta para ' + reason + ': o SQLite em modo WAL não é seguro sob sincronizador ou volume de rede (commits somem, cópias "brain 2.sqlite" aparecem). Use um disco local (padrão: ~/Library/Application Support/BBrainX no macOS; defina BBRAINX_HOME para uma pasta local) e mova os dados com o comando backup. Se você aceita o risco: BBRAINX_ALLOW_SYNCED_HOME=1.');
}
