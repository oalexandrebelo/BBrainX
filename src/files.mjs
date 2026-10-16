import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ensure } from './primitives.mjs';
import { remoteFilesystemReason } from './state-location.mjs';

/**
 * Pasta de necessidades: `Downloads/Projetos/<AAAA-MM-DD-nome>/…`. O que os modelos geram (web ou local) fica gravado direto
 * no computador, em texto, e nunca sobrescreve: nome repetido vira `nome-2.ext`. A pasta base vem do host (ambiente ou
 * sistema operacional), nunca de argumento de ferramenta. Nada aqui apaga ou executa arquivo do usuário.
 */
export const FILES_LIMITS = Object.freeze({ fileBytes: 1048576, partBytes: 196608, readChars: 65536, readFileBytes: 8 * 1048576, depth: 3, versions: 99, listNeeds: 200, listFiles: 1000, uploadMs: 24 * 3600000 });
export const TEXT_EXTENSIONS = Object.freeze(['.md', '.txt', '.csv', '.tsv', '.json', '.html', '.xml', '.yaml', '.yml', '.toml', '.js', '.ts', '.py', '.sql', '.sh', '.css', '.svg', '.mmd']);
const NEED = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]{1,59}$/;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,99}$/;
const DOWNLOADS_GUID = '{374DE290-123F-4565-9164-39C4925E467B}';

const fail = (code, detail) => ensure(false, code, detail);
/** EPERM/EACCES em Downloads no macOS é a privacidade do sistema (TCC), não permissão Unix: diz onde liberar. */
function permission(error, target, platform = process.platform) {
  if (error?.code !== 'EPERM' && error?.code !== 'EACCES') throw error;
  fail('FILES_PERMISSION_DENIED', platform === 'darwin'
    ? 'O macOS bloqueou o acesso a ' + target + '. Libere em Ajustes do Sistema → Privacidade e Segurança → Arquivos e Pastas (Downloads) para o app que roda o BBrainX (Terminal, VS Code, Claude, Codex), ou defina BBRAINX_FILES_ROOT para outra pasta.'
    : 'Sem permissão para ' + target + '. Ajuste as permissões da pasta ou defina BBRAINX_FILES_ROOT.');
}
const guard = (fn, target) => { try { return fn(); } catch (e) { return permission(e, target); } };

// ---------------------------------------------------------------------------------------------- pasta base por sistema
function windowsDownloads(env, readRegistry) {
  const raw = readRegistry('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', DOWNLOADS_GUID);
  const profile = env.USERPROFILE || os.homedir();
  if (typeof raw === 'string' && raw.trim()) return raw.trim().replace(/%([^%]+)%/g, (whole, name) => name.toUpperCase() === 'USERPROFILE' ? profile : env[name] ?? env[Object.keys(env).find(k => k.toUpperCase() === name.toUpperCase())] ?? whole);
  return path.win32.join(profile, 'Downloads');
}
/** `reg query` devolve `    {GUID}    REG_EXPAND_SZ    %USERPROFILE%\Downloads`. Sem reg (ou sem o valor): null. */
export function readWindowsRegistry(key, value) {
  const result = spawnSync('reg', ['query', key, '/v', value], { encoding: 'utf8', timeout: 5000, windowsHide: true, shell: false });
  if (result.error || result.status !== 0) return null;
  const line = result.stdout.split(/\r?\n/).find(l => l.includes(value));
  const match = line && /REG_(?:EXPAND_)?SZ\s+(.+)$/.exec(line);
  return match ? match[1] : null;
}
function linuxDownloads(env, home, readFile) {
  const config = env.XDG_CONFIG_HOME || path.posix.join(home, '.config');
  let text = null; try { text = readFile(path.posix.join(config, 'user-dirs.dirs')); } catch { /* sem xdg-user-dirs */ }
  const match = text && /^\s*XDG_DOWNLOAD_DIR\s*=\s*"([^"\n]*)"/m.exec(text);
  if (match) {
    const value = match[1].replace(/^\$HOME(?=\/|$)/, home).replace(/^\$\{HOME\}(?=\/|$)/, home);
    if (path.posix.isAbsolute(value) && value !== home) return value;
  }
  return path.posix.join(home, 'Downloads');
}
/**
 * Pasta base: BBRAINX_FILES_ROOT, senão Downloads/Projetos do sistema. Windows lê a pasta Downloads real do registro (o
 * usuário pode tê-la movido para outro disco); Linux lê XDG_DOWNLOAD_DIR (nome traduzido, como ~/Transferências). Injetável.
 */
export function filesRoot({ env = process.env, platform = process.platform, home = os.homedir(), readRegistry = readWindowsRegistry, readFile = file => fs.readFileSync(file, 'utf8') } = {}) {
  if (env.BBRAINX_FILES_ROOT) {
    const flavour = platform === 'win32' ? path.win32 : path.posix;
    ensure(flavour.isAbsolute(env.BBRAINX_FILES_ROOT), 'FILES_ROOT_INVALID', 'BBRAINX_FILES_ROOT precisa ser caminho absoluto.');
    return { root: flavour.resolve(env.BBRAINX_FILES_ROOT), source: 'env' };
  }
  if (platform === 'win32') return { root: path.win32.join(windowsDownloads(env, readRegistry), 'Projetos'), source: 'windows-known-folder' };
  if (platform === 'darwin') return { root: path.posix.join(home, 'Downloads', 'Projetos'), source: 'macos-downloads' };
  return { root: path.posix.join(linuxDownloads(env, home, readFile), 'Projetos'), source: 'xdg-download-dir' };
}
/** Cria a pasta base se faltar e devolve o caminho real. Volume de rede é recusado; symlink na própria base é aceito (escolha do usuário). */
export function prepareRoot(options = {}) {
  const { root, source } = filesRoot(options);
  const reason = remoteFilesystemReason(root);
  ensure(!reason, 'FILES_ROOT_REMOTE', 'A pasta de necessidades ' + root + ' está em ' + reason + '. Defina BBRAINX_FILES_ROOT para um disco local.');
  guard(() => fs.mkdirSync(root, { recursive: true }), root);
  const real = guard(() => fs.realpathSync.native(root), root);
  ensure(fs.statSync(real).isDirectory(), 'FILES_ROOT_INVALID', root + ' não é uma pasta.');
  return { root: real, source };
}

// ---------------------------------------------------------------------------------------------- caminhos seguros
/** Nome curto da necessidade: minúsculas ASCII, hífens; "Proposta Cliente X" → proposta-cliente-x. */
export function needSlug(name) {
  ensure(typeof name === 'string' && name.length <= 200, 'FILES_NEED_INVALID', 'name: texto de até 200 caracteres.');
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  ensure(/^[a-z0-9][a-z0-9-]{1,59}$/.test(slug), 'FILES_NEED_INVALID', 'O nome da necessidade precisa de ao menos 2 letras ou números.');
  return slug;
}
const localDate = (now = new Date()) => now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
function plainDirectory(target) {
  const stat = fs.lstatSync(target);
  ensure(stat.isDirectory() && !stat.isSymbolicLink(), 'FILES_UNSAFE_PATH', target + ' não é uma pasta comum (symlink ou arquivo).');
  return stat;
}
function needPath(root, need) {
  ensure(typeof need === 'string' && NEED.test(need), 'FILES_NEED_INVALID', 'need: o nome da pasta devolvido por files_open (AAAA-MM-DD-nome).');
  const target = path.join(root, need);
  guard(() => { try { plainDirectory(target); } catch (e) { if (e.code === 'ENOENT') fail('FILES_NEED_NOT_FOUND', 'Necessidade ' + need + ' não existe; chame files_open.'); throw e; } }, target);
  return target;
}
/** Caminho relativo dentro da necessidade: até 3 níveis, segmentos simples, sem `..`, sem ponto inicial, extensão de texto. */
export function relativeParts(relative) {
  ensure(typeof relative === 'string' && relative.length >= 1 && relative.length <= 300, 'FILES_PATH_INVALID', 'path: 1..300 caracteres.');
  const parts = relative.replaceAll('\\', '/').split('/');
  ensure(parts.length <= FILES_LIMITS.depth && parts.every(p => SEGMENT.test(p) && p !== '.' && p !== '..' && !p.endsWith('.') && !p.endsWith(' ')), 'FILES_PATH_INVALID', 'path: até ' + FILES_LIMITS.depth + ' níveis com letras, números, espaço, ponto, hífen e sublinhado (ex.: "docs/proposta.md").');
  return parts;
}
function textExtension(name) {
  const extension = path.extname(name).toLowerCase();
  ensure(TEXT_EXTENSIONS.includes(extension), 'FILES_EXTENSION_REFUSED', 'Só texto: ' + TEXT_EXTENSIONS.join(' ') + '. PDF, DOCX e XLSX saem das propostas (files_proposals).');
  return extension;
}
/** Cria as subpastas uma a uma, recusando symlink em qualquer nível; devolve a pasta final. */
function directoryFor(base, parts) {
  let current = base;
  for (const part of parts) {
    current = path.join(current, part);
    try { fs.mkdirSync(current); } catch (e) { if (e.code !== 'EEXIST') permission(e, current); }
    plainDirectory(current);
  }
  return current;
}
/** Nome da n-ésima versão: proposta.md, proposta-2.md, … Um "-1" do próprio nome não é versão. */
export function versionName(name, version) {
  if (version === 1) return name;
  const extension = path.extname(name);
  return name.slice(0, name.length - extension.length) + '-' + version + extension;
}
function validText(content) {
  ensure(typeof content === 'string', 'FILES_CONTENT_INVALID', 'content: texto.');
  ensure(!content.includes('\u0000') && content.isWellFormed(), 'FILES_NOT_TEXT', 'O conteúdo precisa ser texto UTF-8 (sem NUL nem caracteres partidos).');
  return Buffer.from(content, 'utf8');
}
/**
 * Publica exclusivamente: O_CREAT|O_EXCL|O_NOFOLLOW, fsync, confere que o nome ainda é o arquivo criado. Nome tomado: próxima
 * versão. Falha no meio remove só o que este processo criou.
 */
function publish(directory, name, bytes) {
  for (let version = 1; version <= FILES_LIMITS.versions; version++) {
    const candidate = versionName(name, version), target = path.join(directory, candidate);
    let descriptor;
    try { descriptor = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o644); }
    catch (e) { if (e.code === 'EEXIST') continue; permission(e, target); }
    const owned = fs.fstatSync(descriptor);
    let failure;
    try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); }
    catch (e) { failure = e; }
    finally { try { fs.closeSync(descriptor); } catch (e) { failure ??= e; } }
    if (failure) { try { const now = fs.lstatSync(target); if (now.ino === owned.ino && now.dev === owned.dev) fs.unlinkSync(target); } catch { /* já não é nosso */ } permission(failure, target); }
    return { name: candidate, target, version };
  }
  fail('FILES_TOO_MANY_VERSIONS', name + ' já tem ' + FILES_LIMITS.versions + ' versões; use outro nome.');
}

// ---------------------------------------------------------------------------------------------- necessidades
/** Abre (ou cria) a pasta da necessidade. Mesmo nome curto em outra data: reusa a mais recente, o trabalho continua. */
export function openNeed(root, { name, now = new Date() } = {}) {
  const slug = needSlug(name);
  const existing = guard(() => fs.readdirSync(root, { withFileTypes: true }), root)
    .filter(entry => entry.isDirectory() && NEED.test(entry.name) && entry.name.slice(11) === slug).map(entry => entry.name).sort();
  if (existing.length) return { need: existing.at(-1), path: path.join(root, existing.at(-1)), created: false };
  const need = localDate(now) + '-' + slug, target = path.join(root, need);
  try { fs.mkdirSync(target); } catch (e) { if (e.code !== 'EEXIST') permission(e, target); }
  plainDirectory(target);
  return { need, path: target, created: true };
}
const describe = (need, root, target, bytes, version, requested) => {
  const relative = path.relative(path.join(root, need), target).split(path.sep).join('/');
  return { need, path: relative, absolute: target, fileUrl: pathToFileURL(target).href, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), version, ...(relative !== requested ? { requested } : {}) };
};
/** Grava um arquivo de texto inteiro (até 1 MiB). Nunca sobrescreve: devolve o nome realmente usado. */
export function writeText(root, { need, path: relative, content }) {
  const base = needPath(root, need), parts = relativeParts(relative);
  textExtension(parts.at(-1));
  const bytes = validText(content);
  ensure(bytes.length <= FILES_LIMITS.fileBytes, 'FILES_TOO_LARGE', 'Até ' + FILES_LIMITS.fileBytes + ' bytes por arquivo; divida em arquivos menores.');
  const directory = directoryFor(base, parts.slice(0, -1));
  const result = publish(directory, parts.at(-1), bytes);
  return describe(need, root, result.target, bytes, result.version, parts.join('/'));
}

// ---------------------------------------------------------------------------------------------- envio em partes
/**
 * A web manda no máximo 256 KiB por requisição: arquivos maiores vão em partes. As partes ficam no estado do BBrainX
 * (`files-v1/uploads`), nunca na pasta do usuário; só a última publica, com a mesma regra de nunca sobrescrever.
 */
export function writePart(root, home, { need, path: relative, content, part, uploadId, final = false }) {
  needPath(root, need); const parts = relativeParts(relative); textExtension(parts.at(-1));
  ensure(Number.isInteger(part) && part >= 1 && part <= 64, 'FILES_PART_INVALID', 'part: 1..64.');
  const bytes = validText(content);
  ensure(bytes.length <= FILES_LIMITS.partBytes, 'FILES_PART_TOO_LARGE', 'Até ' + FILES_LIMITS.partBytes + ' bytes por parte.');
  const uploads = path.join(home, 'files-v1', 'uploads');
  fs.mkdirSync(uploads, { recursive: true, mode: 0o700 });
  let id = uploadId, meta;
  if (part === 1) { ensure(uploadId === undefined, 'FILES_PART_INVALID', 'A parte 1 inicia o envio; não passe uploadId.'); id = randomBytes(12).toString('hex'); meta = { need, path: parts.join('/'), parts: 0, bytes: 0, started: Date.now() }; }
  else {
    ensure(typeof id === 'string' && /^[0-9a-f]{24}$/.test(id), 'FILES_UPLOAD_INVALID', 'uploadId: o valor devolvido pela parte 1.');
    try { meta = JSON.parse(fs.readFileSync(path.join(uploads, id + '.json'), 'utf8')); } catch { fail('FILES_UPLOAD_NOT_FOUND', 'Envio ' + id + ' não existe ou expirou (24 h).'); }
    ensure(meta.need === need && meta.path === parts.join('/') && meta.parts === part - 1, 'FILES_PART_OUT_OF_ORDER', 'Parte ' + part + ' fora de ordem: o envio ' + id + ' está na parte ' + meta.parts + ' de ' + meta.path + '.');
  }
  ensure(meta.bytes + bytes.length <= FILES_LIMITS.fileBytes, 'FILES_TOO_LARGE', 'Até ' + FILES_LIMITS.fileBytes + ' bytes por arquivo.');
  const data = path.join(uploads, id + '.part');
  fs.appendFileSync(data, bytes, { mode: 0o600 });
  meta = { ...meta, parts: part, bytes: meta.bytes + bytes.length };
  if (!final) { fs.writeFileSync(path.join(uploads, id + '.json'), JSON.stringify(meta), { mode: 0o600 }); return { uploadId: id, part, bytes: meta.bytes, final: false }; }
  // Cada parte chega como texto completo e bem formado (surrogate solto é recusado acima): a junção é UTF-8 válida.
  const whole = fs.readFileSync(data);
  const result = writeText(root, { need, path: meta.path, content: whole.toString('utf8') });
  for (const suffix of ['.part', '.json']) fs.rmSync(path.join(uploads, id + suffix), { force: true });
  return { ...result, parts: part };
}
/** Remove envios em partes abandonados há mais de 24 h (só no estado do BBrainX). */
export function cleanUploads(home, { now = Date.now() } = {}) {
  const uploads = path.join(home, 'files-v1', 'uploads');let removed = 0;
  let entries = []; try { entries = fs.readdirSync(uploads); } catch { return { removed }; }
  for (const name of entries) {
    if (!/^[0-9a-f]{24}\.(part|json)$/.test(name)) continue;
    const file = path.join(uploads, name);
    try { if (now - fs.statSync(file).mtimeMs > FILES_LIMITS.uploadMs) { fs.rmSync(file, { force: true }); removed++; } } catch { /* já removido */ }
  }
  return { removed };
}

// ---------------------------------------------------------------------------------------------- listar e ler
/** Sem `need`: as necessidades, mais recentes primeiro. Com `need`: os arquivos dela (até 3 níveis, sem ocultos nem symlinks). */
export function listNeed(root, { need } = {}) {
  if (need === undefined) {
    const needs = guard(() => fs.readdirSync(root, { withFileTypes: true }), root).filter(e => e.isDirectory() && NEED.test(e.name)).map(e => e.name).sort().reverse();
    return { root, needs: needs.slice(0, FILES_LIMITS.listNeeds).map(name => ({ need: name, path: path.join(root, name) })), truncated: needs.length > FILES_LIMITS.listNeeds };
  }
  const base = needPath(root, need), files = [];let truncated = false;
  const walk = (directory, prefix, depth) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name), relative = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory()) { if (depth < FILES_LIMITS.depth) walk(full, relative, depth + 1); continue; }
      if (!entry.isFile()) continue;
      if (files.length >= FILES_LIMITS.listFiles) { truncated = true; return; }
      const stat = fs.statSync(full);
      files.push({ path: relative, bytes: stat.size, modified: stat.mtime.toISOString(), text: TEXT_EXTENSIONS.includes(path.extname(entry.name).toLowerCase()) });
    }
  };
  guard(() => walk(base, '', 1), base);
  return { need, path: base, files, truncated };
}
/** Abre sem seguir symlink, confere que o nome ainda é o arquivo aberto e devolve o texto inteiro (até 8 MiB, UTF-8). */
function openText(root, need, relative) {
  const base = needPath(root, need), parts = relativeParts(relative);
  let current = base;
  for (const part of parts.slice(0, -1)) { current = path.join(current, part); guard(() => plainDirectory(current), current); }
  const target = path.join(current, parts.at(-1));
  let descriptor;
  try { descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)); }
  catch (e) { if (e.code === 'ENOENT') fail('FILES_NOT_FOUND', relative + ' não existe em ' + need + '.'); if (e.code === 'ELOOP') fail('FILES_UNSAFE_PATH'); permission(e, target); }
  try {
    const opened = fs.fstatSync(descriptor), named = fs.lstatSync(target);
    ensure(opened.isFile() && !named.isSymbolicLink() && opened.ino === named.ino && opened.dev === named.dev, 'FILES_UNSAFE_PATH');
    ensure(opened.size <= FILES_LIMITS.readFileBytes, 'FILES_TOO_LARGE', 'Arquivo acima de 8 MiB.');
    const buffer = Buffer.alloc(opened.size); fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { fail('FILES_NOT_TEXT', relative + ' não é texto (PDF, DOCX e XLSX abrem no computador: ' + pathToFileURL(target).href + ').'); }
    ensure(!text.includes('\u0000'), 'FILES_NOT_TEXT');
    return { text, target, parts, sha256: createHash('sha256').update(buffer).digest('hex') };
  } finally { fs.closeSync(descriptor); }
}
export function readWholeText(root, need, relative) { return openText(root, need, relative); }
/** Janela de até 64 KiB de um arquivo de texto da necessidade. */
export function readText(root, { need, path: relative, start = 0 }) {
  ensure(Number.isInteger(start) && start >= 0, 'FILES_RANGE_INVALID');
  const { text, target, parts } = openText(root, need, relative);
  const end = Math.min(text.length, start + FILES_LIMITS.readChars);
  return { need, path: parts.join('/'), absolute: target, fileUrl: pathToFileURL(target).href, start, end, total: text.length, more: end < text.length, content: text.slice(start, end) };
}
export const BINARY_EXTENSIONS = Object.freeze(['.pdf', '.docx', '.xlsx']);
/** Só para entregáveis aprovados (deliverables.build): PDF, DOCX ou XLSX, com a mesma regra de nunca sobrescrever. Não é ferramenta. */
export function writeDeliverable(root, { need, path: relative, bytes }) {
  const base = needPath(root, need), parts = relativeParts(relative);
  ensure(BINARY_EXTENSIONS.includes(path.extname(parts.at(-1)).toLowerCase()) && Buffer.isBuffer(bytes), 'FILES_EXTENSION_REFUSED');
  const directory = directoryFor(base, parts.slice(0, -1));
  const result = publish(directory, parts.at(-1), bytes);
  return describe(need, root, result.target, bytes, result.version, parts.join('/'));
}
