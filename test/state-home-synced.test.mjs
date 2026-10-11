import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as host from '../src/host.mjs';
import { BrainStore } from '../src/store.mjs';
import { SharedAdmission } from '../src/shared-admission.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const none = () => [];
const scratch = t => { const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bbrainx-sync-'))); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };

test('pastas de sincronização conhecidas são recusadas pelo nome; pastas locais passam', () => {
  for (const p of ['/Users/u/Library/Mobile Documents/com~apple~CloudDocs/BBrainX', '/Users/u/Library/CloudStorage/Dropbox/BBrainX', '/Users/u/Library/CloudStorage/GoogleDrive-a@b.c/My Drive/B',
    '/Users/u/Library/CloudStorage/OneDrive-Empresa/BBrainX', '/Users/u/Dropbox/BBrainX', '/Users/u/Dropbox (Personal)/BBrainX', '/Users/u/OneDrive - Empresa/BBrainX', '/Users/u/Google Drive/BBrainX', '/Users/u/ICLOUD DRIVE/BBrainX'])
    assert.match(host.syncedStateReason(p, { mounts: none, platform: 'darwin' }) ?? '', /sincroniza/, p);
  for (const p of ['/Users/u/Library/Application Support/BBrainX', '/Users/u/.local/share/bbrainx', '/tmp/x/state', '/Users/u/Documents/Projetos/BBrainX', '/Users/u/Projects/dropbox-clone/state'])
    assert.equal(host.syncedStateReason(p, { mounts: none, platform: 'darwin' }), null, p);
});

test('Windows: OneDrive e caminho UNC são recusados; unidade local passa', () => {
  const win = { mounts: none, platform: 'win32' };
  assert.match(host.syncedStateReason('C:\\Users\\u\\OneDrive\\BBrainX', win) ?? '', /sincroniza/);
  assert.match(host.syncedStateReason('\\\\servidor\\share\\BBrainX', win) ?? '', /remoto/);
  assert.equal(host.syncedStateReason('C:\\Users\\u\\AppData\\Local\\BBrainX', win), null);
});

test('volume de rede é recusado pelo tipo do ponto de montagem mais específico; local aninhado e prefixo textual passam', () => {
  const mounts = () => [{ point: '/', type: 'apfs' }, { point: '/Volumes/share', type: 'smbfs' }, { point: '/Volumes/share/local', type: 'apfs' }, { point: '/Volumes/nas', type: 'nfs' }, { point: '/mnt/sftp', type: 'fuse.sshfs' }];
  const opts = { mounts, platform: 'darwin' };
  assert.match(host.syncedStateReason('/Volumes/share/BBrainX', opts), /smbfs/);
  assert.match(host.syncedStateReason('/Volumes/nas', opts), /nfs/);
  assert.match(host.syncedStateReason('/mnt/sftp/state', opts), /sshfs/);
  assert.equal(host.syncedStateReason('/Volumes/share/local/BBrainX', opts), null);
  assert.equal(host.syncedStateReason('/Volumes/sharedrive/BBrainX', opts), null, 'prefixo textual de outro ponto de montagem não conta');
  assert.equal(host.syncedStateReason('/Users/u/x', opts), null);
});

test('a recusa é acionável: nomeia o problema, o destino local padrão, o backup e o override', () => {
  assert.throws(() => host.assertLocalState('/Users/u/Library/Mobile Documents/com~apple~CloudDocs/BBrainX', { env: {}, mounts: none }), error => {
    assert.equal(error.code, 'STATE_HOME_SYNCED');
    for (const piece of [/BBRAINX_HOME/, /WAL/, /backup/, /BBRAINX_ALLOW_SYNCED_HOME=1/, /Application Support|disco local/]) assert.match(error.message, piece);
    return true;
  });
  assert.doesNotThrow(() => host.assertLocalState('/Users/u/Library/Mobile Documents/x', { env: { BBRAINX_ALLOW_SYNCED_HOME: '1' }, mounts: none }));
  assert.throws(() => host.assertLocalState('/Users/u/Dropbox/x', { env: { BBRAINX_ALLOW_SYNCED_HOME: 'true' }, mounts: none }), { code: 'STATE_HOME_SYNCED' }, 'só "1" libera');
});

test('BrainStore recusa o home sincronizado antes de criar qualquer pasta, inclusive por ancestral com symlink', t => {
  const dir = scratch(t), dropbox = path.join(dir, 'real', 'Library', 'CloudStorage', 'Dropbox');
  fs.mkdirSync(dropbox, { recursive: true });
  assert.throws(() => new BrainStore(path.join(dir, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BBrainX')), { code: 'STATE_HOME_SYNCED' });
  assert.equal(fs.existsSync(path.join(dir, 'Library')), false, 'nada é criado dentro da pasta sincronizada');
  const alias = path.join(dir, 'alias'); fs.symlinkSync(dropbox, alias, 'dir');
  assert.throws(() => new BrainStore(path.join(alias, 'state')), { code: 'STATE_HOME_SYNCED' });
  assert.equal(fs.existsSync(path.join(dropbox, 'state')), false, 'o symlink de ancestral é resolvido antes do mkdir');
});

test('a admissão compartilhada também recusa antes de criar o banco', t => {
  const home = path.join(scratch(t), 'Dropbox', 'BBrainX');
  assert.throws(() => new SharedAdmission(home), { code: 'STATE_HOME_SYNCED' });
  assert.equal(fs.existsSync(path.dirname(home)), false);
});

test('CLI: BBRAINX_HOME sob Mobile Documents sai com exit 1 e STATE_HOME_SYNCED; o override explícito segue adiante', t => {
  const dir = scratch(t), home = path.join(dir, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BBrainX');
  const run = env => spawnSync(process.execPath, [path.join(root, 'bin', 'bbrainx.mjs'), 'memory', '--project', 'p'], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
  const refused = run({ BBRAINX_HOME: home });
  assert.equal(refused.status, 1); assert.match(refused.stderr, /STATE_HOME_SYNCED/); assert.equal(fs.existsSync(home), false);
  const allowed = run({ BBRAINX_HOME: home, BBRAINX_ALLOW_SYNCED_HOME: '1' });
  assert.doesNotMatch(allowed.stderr, /STATE_HOME_SYNCED/); assert.equal(fs.existsSync(path.join(home, 'brain.sqlite')), true);
});

test('doctor reporta o home sincronizado e deixa de estar pronto', () => {
  const node = { nodeVersion: '24.21.0', mounts: none };   // versão injetada: o resultado não depende do Node que roda a suíte
  const report = host.doctor({ ...node, env: { BBRAINX_HOME: '/Users/u/Dropbox/BBrainX' } });
  assert.equal(report.stateSync.local, false); assert.match(report.stateSync.reason, /sincroniza/); assert.equal(report.ready, false);
  assert.ok(report.blockers.some(item => /BBRAINX_HOME/.test(item) && /BBRAINX_ALLOW_SYNCED_HOME=1/.test(item)), JSON.stringify(report.blockers));
  assert.equal(host.doctor({ ...node, env: { BBRAINX_HOME: '/Users/u/Dropbox/BBrainX', BBRAINX_ALLOW_SYNCED_HOME: '1' } }).stateSync.local, true);
  assert.equal(host.doctor({ ...node, env: { BBRAINX_HOME: '/tmp/ok' } }).stateSync.local, true);
});
