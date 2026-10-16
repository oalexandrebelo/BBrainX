import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { filesRoot, prepareRoot, needSlug, openNeed, writeText, writePart, cleanUploads, listNeed, readText, versionName, FILES_LIMITS } from '../src/files.mjs';

const entry = fileURLToPath(new URL('../bin/bbrainx.mjs', import.meta.url));
function sandbox(t) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bb-files-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'Downloads', 'Projetos'), home = path.join(base, 'state');
  fs.mkdirSync(root, { recursive: true }); fs.mkdirSync(home, { recursive: true });
  return { base, root, home };
}

test('the needs folder is Downloads/Projetos on each system, or BBRAINX_FILES_ROOT', () => {
  assert.deepEqual(filesRoot({ env: {}, platform: 'darwin', home: '/Users/ana' }), { root: '/Users/ana/Downloads/Projetos', source: 'macos-downloads' });
  // Windows: a pasta Downloads real vem do registro, mesmo movida para outro disco; sem o valor, %USERPROFILE%\Downloads.
  const moved = filesRoot({ env: { USERPROFILE: 'C:\\Users\\ana' }, platform: 'win32', home: 'C:\\Users\\ana', readRegistry: (key, value) => { assert.equal(value, '{374DE290-123F-4565-9164-39C4925E467B}'); return 'D:\\Baixados'; } });
  assert.deepEqual(moved, { root: 'D:\\Baixados\\Projetos', source: 'windows-known-folder' });
  assert.equal(filesRoot({ env: { USERPROFILE: 'C:\\Users\\ana' }, platform: 'win32', home: 'C:\\Users\\ana', readRegistry: () => '%USERPROFILE%\\Downloads' }).root, 'C:\\Users\\ana\\Downloads\\Projetos');
  assert.equal(filesRoot({ env: { USERPROFILE: 'C:\\Users\\ana' }, platform: 'win32', home: 'C:\\Users\\ana', readRegistry: () => null }).root, 'C:\\Users\\ana\\Downloads\\Projetos');
  // Linux: XDG_DOWNLOAD_DIR traduzido; sem o arquivo, ~/Downloads.
  const dirs = '# gerado\nXDG_DESKTOP_DIR="$HOME/Área de trabalho"\nXDG_DOWNLOAD_DIR="$HOME/Transferências"\n';
  assert.equal(filesRoot({ env: {}, platform: 'linux', home: '/home/ana', readFile: file => { assert.equal(file, '/home/ana/.config/user-dirs.dirs'); return dirs; } }).root, '/home/ana/Transferências/Projetos');
  assert.equal(filesRoot({ env: {}, platform: 'linux', home: '/home/ana', readFile: () => { throw Object.assign(new Error('x'), { code: 'ENOENT' }); } }).root, '/home/ana/Downloads/Projetos');
  assert.equal(filesRoot({ env: { BBRAINX_FILES_ROOT: '/srv/saida' }, platform: 'linux', home: '/home/ana' }).root, '/srv/saida');
  assert.throws(() => filesRoot({ env: { BBRAINX_FILES_ROOT: 'relativa' }, platform: 'linux' }), { code: 'FILES_ROOT_INVALID' });
});

test('a need folder is AAAA-MM-DD-name and the same short name continues the newest one', t => {
  const { root } = sandbox(t);
  assert.equal(needSlug('Proposta Cliente X — Ação!'), 'proposta-cliente-x-acao');
  assert.throws(() => needSlug('!'), { code: 'FILES_NEED_INVALID' });
  const first = openNeed(root, { name: 'Proposta cliente X', now: new Date(2026, 9, 14) });
  assert.deepEqual([first.need, first.created], ['2026-10-14-proposta-cliente-x', true]);
  const again = openNeed(root, { name: 'proposta-cliente-x', now: new Date(2026, 9, 16) });
  assert.deepEqual([again.need, again.created], ['2026-10-14-proposta-cliente-x', false], 'another conversation resumes the same folder');
  assert.equal(openNeed(root, { name: 'outra coisa', now: new Date(2026, 9, 16) }).need, '2026-10-16-outra-coisa');
});

test('writing never overwrites: a repeated name becomes name-2, name-3', t => {
  const { root } = sandbox(t), { need } = openNeed(root, { name: 'relatorio' });
  const one = writeText(root, { need, path: 'relatorio.md', content: '# v1\n' });
  const two = writeText(root, { need, path: 'relatorio.md', content: '# v2\n' });
  const three = writeText(root, { need, path: 'docs/anexo.csv', content: 'a;b\n1;2\n' });
  assert.deepEqual([one.path, one.version, two.path, two.version, two.requested], ['relatorio.md', 1, 'relatorio-2.md', 2, 'relatorio.md']);
  assert.equal(fs.readFileSync(one.absolute, 'utf8'), '# v1\n', 'the first version is intact');
  assert.equal(three.path, 'docs/anexo.csv');assert.match(one.fileUrl, /^file:\/\//);
  assert.equal(one.sha256.length, 64);assert.equal(versionName('fase-1.md', 2), 'fase-1-2.md');
  assert.deepEqual(listNeed(root, { need }).files.map(f => f.path), ['docs/anexo.csv', 'relatorio-2.md', 'relatorio.md']);
  assert.deepEqual(listNeed(root).needs.map(n => n.need), [need]);
});

test('only text inside the need: traversal, hidden names, symlinks, binaries, oversize and wrong extensions are refused', t => {
  const { base, root } = sandbox(t), { need } = openNeed(root, { name: 'seguro' });
  for (const bad of ['../fora.md', '.oculto.md', 'a/../../b.md', 'x/y/z/w.md', '/abs.md', 'nome.md.', 'C:\\x.md'])
    assert.throws(() => writeText(root, { need, path: bad, content: 'x' }), { code: 'FILES_PATH_INVALID' }, bad);
  assert.throws(() => writeText(root, { need, path: 'app.exe', content: 'x' }), { code: 'FILES_EXTENSION_REFUSED' });
  assert.throws(() => writeText(root, { need, path: 'a.pdf', content: 'x' }), { code: 'FILES_EXTENSION_REFUSED' });
  assert.throws(() => writeText(root, { need, path: 'a.md', content: 'a\u0000b' }), { code: 'FILES_NOT_TEXT' });
  assert.throws(() => writeText(root, { need, path: 'a.md', content: '\ud800' }), { code: 'FILES_NOT_TEXT' });
  assert.throws(() => writeText(root, { need, path: 'a.md', content: 'x'.repeat(FILES_LIMITS.fileBytes + 1) }), { code: 'FILES_TOO_LARGE' });
  assert.throws(() => writeText(root, { need: '../x', path: 'a.md', content: 'x' }), { code: 'FILES_NEED_INVALID' });
  assert.throws(() => writeText(root, { need: '2026-01-01-nao-existe', path: 'a.md', content: 'x' }), { code: 'FILES_NEED_NOT_FOUND' });
  // Symlink em qualquer nível (subpasta ou o próprio arquivo) nunca é seguido para fora.
  const outside = path.join(base, 'fora'); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(root, need, 'link'));
  assert.throws(() => writeText(root, { need, path: 'link/a.md', content: 'x' }), { code: 'FILES_UNSAFE_PATH' });
  fs.symlinkSync(path.join(outside, 'alvo.md'), path.join(root, need, 'alvo.md'));
  const result = writeText(root, { need, path: 'alvo.md', content: 'x' });
  assert.equal(result.path, 'alvo-2.md', 'a symlink name counts as taken and is never written through');
  assert.deepEqual(fs.readdirSync(outside), [], 'nothing was created outside the need');
  fs.symlinkSync(outside, path.join(root, '2026-01-01-ponte'));
  assert.throws(() => writeText(root, { need: '2026-01-01-ponte', path: 'a.md', content: 'x' }), { code: 'FILES_UNSAFE_PATH' });
  assert.throws(() => readText(root, { need, path: 'alvo.md' }), { code: 'FILES_UNSAFE_PATH' });
});

test('large content goes in parts kept out of the user folder; only the final part publishes, abandoned uploads are cleaned', t => {
  const { root, home } = sandbox(t), { need } = openNeed(root, { name: 'grande' });
  const piece = 'ção'.repeat(30000);
  const first = writePart(root, home, { need, path: 'texto.md', content: piece, part: 1 });
  assert.equal(first.final, false);assert.match(first.uploadId, /^[0-9a-f]{24}$/);
  assert.deepEqual(fs.readdirSync(path.join(root, need)), [], 'nothing appears in the need before the final part');
  assert.throws(() => writePart(root, home, { need, path: 'texto.md', content: 'x', part: 3, uploadId: first.uploadId }), { code: 'FILES_PART_OUT_OF_ORDER' });
  writePart(root, home, { need, path: 'texto.md', content: piece, part: 2, uploadId: first.uploadId });
  const done = writePart(root, home, { need, path: 'texto.md', content: 'fim', part: 3, uploadId: first.uploadId, final: true });
  assert.equal(fs.readFileSync(done.absolute, 'utf8'), piece + piece + 'fim');assert.equal(done.parts, 3);
  assert.deepEqual(fs.readdirSync(path.join(home, 'files-v1', 'uploads')), []);
  const stale = writePart(root, home, { need, path: 'b.md', content: 'x', part: 1 });
  assert.equal(cleanUploads(home, { now: Date.now() + FILES_LIMITS.uploadMs + 1000 }).removed, 2);
  assert.throws(() => writePart(root, home, { need, path: 'b.md', content: 'y', part: 2, uploadId: stale.uploadId, final: true }), { code: 'FILES_UPLOAD_NOT_FOUND' });
  assert.throws(() => writePart(root, home, { need, path: 'c.md', content: 'x'.repeat(FILES_LIMITS.partBytes + 1), part: 1 }), { code: 'FILES_PART_TOO_LARGE' });
});

test('reading returns 64 KiB windows of text and refuses binaries with a link to open them locally', t => {
  const { root } = sandbox(t), { need } = openNeed(root, { name: 'leitura' });
  writeText(root, { need, path: 'longo.txt', content: 'a'.repeat(70000) + 'FIM' });
  const window = readText(root, { need, path: 'longo.txt' });
  assert.deepEqual([window.start, window.end, window.more, window.total], [0, 65536, true, 70003]);
  assert.ok(readText(root, { need, path: 'longo.txt', start: window.end }).content.endsWith('FIM'));
  fs.writeFileSync(path.join(root, need, 'imagem.md'), Buffer.from([0xff, 0xfe, 0x00]));
  assert.throws(() => readText(root, { need, path: 'imagem.md' }), { code: 'FILES_NOT_TEXT' });
  assert.throws(() => readText(root, { need, path: 'sumiu.md' }), { code: 'FILES_NOT_FOUND' });
});

test('prepareRoot creates the folder; the CLI writes from stdin and the MCP server exposes files_* only with --files', t => {
  const { base } = sandbox(t), root = path.join(base, 'Nova', 'Projetos'), home = path.join(base, 'state2');
  assert.equal(prepareRoot({ env: { BBRAINX_FILES_ROOT: root } }).root, fs.realpathSync.native(root));
  const env = { ...process.env, BBRAINX_HOME: home, BBRAINX_FILES_ROOT: root };
  const cli = (args, input) => { const r = spawnSync(process.execPath, [entry, 'files', ...args], { encoding: 'utf8', env, input, timeout: 20000 }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  const { need } = cli(['open', '--name', 'teste cli']);
  const written = cli(['write', '--need', need, '--path', 'nota.md'], '# Olá\nconteúdo\n');
  assert.equal(fs.readFileSync(written.absolute, 'utf8'), '# Olá\nconteúdo\n');
  assert.equal(cli(['setup']).project, 'projetos');
  const search = spawnSync(process.execPath, [entry, 'search', '--project', 'projetos', '--query', 'conteúdo'], { encoding: 'utf8', env, timeout: 20000 });
  assert.equal(search.status, 0, search.stderr);assert.match(JSON.parse(search.stdout).items[0].path, /nota\.md$/);
  cli(['write', '--need', need, '--path', 'segunda.md'], 'palavrarara\n');
  const again = spawnSync(process.execPath, [entry, 'search', '--project', 'projetos', '--query', 'palavrarara'], { encoding: 'utf8', env, timeout: 20000 });
  assert.equal(again.status, 0, 'the index was refreshed by the write: ' + again.stderr);
  const tools = flag => {
    const r = spawnSync(process.execPath, [entry, 'mcp', '--project', 'projetos', ...flag], { cwd: root, encoding: 'utf8', env, timeout: 20000,
      input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }) + '\n' + JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n' });
    return r.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(m => m.id === 2).result.tools.map(x => x.name).filter(n => n.startsWith('files_'));
  };
  assert.deepEqual(tools([]), []);
  assert.deepEqual(tools(['--files']), ['files_open', 'files_write', 'files_list', 'files_read', 'files_proposals', 'files_build', 'files_dismiss']);
});
