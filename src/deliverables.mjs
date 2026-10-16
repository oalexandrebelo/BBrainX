import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ensure } from './primitives.mjs';
import { listNeed, readWholeText, writeDeliverable, cleanUploads } from './files.mjs';

/**
 * Propostas de entregáveis. Como a gravação nunca sobrescreve, uma necessidade acumula versões (proposta.md, proposta-2.md…).
 * Uma vez por dia o BBrainX agrupa as versões de cada arquivo e propõe gerar o binário da mais recente: PDF e DOCX de .md,
 * PDF de .txt, XLSX de .csv. Só gera com aprovação (build), confere que a fonte não mudou e nunca apaga nem sobrescreve.
 */
export const ANALYSIS_INTERVAL_MS = 24 * 3600000;
const TARGETS = Object.freeze({ '.md': ['pdf', 'docx'], '.txt': ['pdf'], '.csv': ['xlsx'] });
const VERSIONED = /^(.*?)-([2-9]|[1-9]\d)(\.(?:md|txt|csv))$/i, SOURCE = /\.(?:md|txt|csv)$/i;
const MAX_PROPOSALS = 500;

function stateDir(home) { const dir = path.join(home, 'files-v1'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); return dir; }
/** Ler-alterar-gravar sob trava entre processos (SQLite BEGIN EXCLUSIVE: o sistema solta se o processo morrer). */
function withState(home, mutate) {
  const dir = stateDir(home), file = path.join(dir, 'proposals.json');
  const lock = new DatabaseSync(path.join(dir, '.lock.sqlite'), { timeout: 15000 });
  try {
    lock.exec('BEGIN EXCLUSIVE');
    let state = { schemaVersion: 1, lastAnalysis: null, proposals: [] };
    try { const parsed = JSON.parse(fs.readFileSync(file, 'utf8')); if (parsed?.schemaVersion === 1 && Array.isArray(parsed.proposals)) state = parsed; } catch { /* primeira vez ou arquivo ilegível: recomeça, as fontes continuam na pasta */ }
    const result = mutate(state);
    if (result?.write !== false) {
      const temporary = path.join(dir, '.proposals.' + randomUUID() + '.tmp');
      try { fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, file); } finally { fs.rmSync(temporary, { force: true }); }
    }
    lock.exec('COMMIT');
    return result?.value ?? state;
  } catch (e) { try { lock.exec('ROLLBACK'); } catch { /* já encerrada */ } throw e; }
  finally { lock.close(); }
}
/** Grupo de versões: mesma pasta e mesmo nome-base. "fase-1.md" é nome, não versão (versões começam em -2). */
export function versionGroups(files) {
  const groups = new Map();
  for (const file of files) {
    if (!file.text || !SOURCE.test(file.path)) continue;
    const directory = path.posix.dirname(file.path), name = path.posix.basename(file.path), match = VERSIONED.exec(name);
    const base = match ? match[1] + match[3] : name, version = match ? Number(match[2]) : 1;
    const key = (directory === '.' ? '' : directory + '/') + base.toLowerCase();
    const group = groups.get(key) ?? { base: (directory === '.' ? '' : directory + '/') + base, versions: [] };
    group.versions.push({ path: file.path, version, modified: file.modified });
    groups.set(key, group);
  }
  return [...groups.values()].map(group => { group.versions.sort((a, b) => a.version - b.version); return { ...group, latest: group.versions.at(-1) }; });
}
const proposalId = (need, source, sha) => createHash('sha256').update(need + '\0' + source + '\0' + sha).digest('hex').slice(0, 12);
const targetPath = (base, format) => base.replace(SOURCE, '.' + format);

/** Analisa todas as necessidades e grava as propostas novas; propostas cuja fonte mudou viram `superseded`. */
export function analyze(root, home, { now = Date.now() } = {}) {
  const needs = listNeed(root).needs.map(entry => entry.need), found = [];
  for (const need of needs) {
    for (const group of versionGroups(listNeed(root, { need }).files)) {
      const extension = path.extname(group.latest.path).toLowerCase();
      let sha; try { sha = readWholeText(root, need, group.latest.path).sha256; } catch { continue; } // grande demais ou não-texto: sem proposta
      found.push({ id: proposalId(need, group.latest.path, sha), need, source: group.latest.path, base: group.base, sha256: sha, versions: group.versions.length, targets: TARGETS[extension].map(format => ({ format, path: targetPath(group.base, format) })) });
    }
  }
  const uploads = cleanUploads(home, { now });
  return withState(home, state => {
    const known = new Map(state.proposals.map(p => [p.id, p])), added = [];
    for (const candidate of found) {
      if (known.has(candidate.id)) continue;
      // Mesma fonte com conteúdo novo: a proposta antiga perde a validade; a nova entra.
      for (const old of state.proposals) if (old.need === candidate.need && old.base === candidate.base && old.status === 'proposed') old.status = 'superseded';
      const proposal = { ...candidate, status: 'proposed', created: new Date(now).toISOString() };
      state.proposals.push(proposal); added.push(proposal);
    }
    // Janela: só registros encerrados saem, os mais antigos primeiro.
    while (state.proposals.length > MAX_PROPOSALS) { const index = state.proposals.findIndex(p => p.status !== 'proposed'); if (index < 0) break; state.proposals.splice(index, 1); }
    state.lastAnalysis = new Date(now).toISOString();
    return { value: { analyzedAt: state.lastAnalysis, needs: needs.length, added: added.length, open: state.proposals.filter(p => p.status === 'proposed').length, uploadsRemoved: uploads.removed } };
  });
}
/** Roda a análise se a última tem mais de 24 h. Chamada pelo timer do AB-S00S e, sem custo quando em dia, por qualquer files.*. */
export function analyzeIfDue(root, home, { now = Date.now(), intervalMs = ANALYSIS_INTERVAL_MS } = {}) {
  const last = withState(home, state => ({ write: false, value: state.lastAnalysis }));
  if (last && now - Date.parse(last) < intervalMs) return { due: false, lastAnalysis: last };
  return { due: true, ...analyze(root, home, { now }) };
}
export function listProposals(home, { status = 'proposed' } = {}) {
  ensure(['proposed', 'built', 'dismissed', 'superseded', 'all'].includes(status), 'FILES_PROPOSAL_STATUS_INVALID');
  return withState(home, state => ({ write: false, value: {
    lastAnalysis: state.lastAnalysis,
    items: state.proposals.filter(p => status === 'all' || p.status === status).slice(-100).reverse()
      .map(p => ({ ...p, prompt: p.versions > 1 ? p.versions + ' versões de ' + p.base + ': gerar ' + p.targets.map(t => t.path).join(' e ') + ' a partir de ' + p.source + '?' : 'Gerar ' + p.targets.map(t => t.path).join(' e ') + ' a partir de ' + p.source + '?' })) } }));
}
// Geradores carregados só na geração aprovada: a partida de todo servidor MCP não paga por eles.
async function render(format, text, title) {
  const { csvToXlsx, markdownToDocx, textToPdf } = await import('./formats.mjs');
  if (format === 'xlsx') return { bytes: csvToXlsx(text), warnings: 0 };
  if (format === 'docx') return { bytes: markdownToDocx(text, { title }), warnings: 0 };
  const pdf = textToPdf(text, { title, markdown: !/\.txt$/i.test(title) });
  return { bytes: pdf.buffer, warnings: pdf.warnings };
}
/**
 * Gera os binários de uma proposta aprovada. A fonte precisa ter o mesmo sha da proposta (mudou depois: recusa e pede nova
 * análise). Cada binário é publicado com a regra de nunca sobrescrever (proposta.pdf, proposta-2.pdf…).
 */
export async function buildProposal(root, home, { id, formats }) {
  ensure(typeof id === 'string' && /^[0-9a-f]{12}$/.test(id), 'FILES_PROPOSAL_INVALID');
  const proposal = withState(home, state => ({ write: false, value: state.proposals.find(p => p.id === id) ?? null }));
  ensure(proposal, 'FILES_PROPOSAL_NOT_FOUND', 'Proposta ' + id + ' não existe; rode files_proposals.');
  ensure(proposal.status === 'proposed', 'FILES_PROPOSAL_CLOSED', 'Proposta ' + id + ' está ' + proposal.status + '.');
  const wanted = formats === undefined ? proposal.targets : proposal.targets.filter(t => formats.includes(t.format));
  ensure(wanted.length > 0, 'FILES_PROPOSAL_FORMAT_INVALID', 'Formatos desta proposta: ' + proposal.targets.map(t => t.format).join(', ') + '.');
  const source = readWholeText(root, proposal.need, proposal.source);
  ensure(source.sha256 === proposal.sha256, 'FILES_PROPOSAL_STALE', proposal.source + ' mudou depois da proposta; rode bbrainx files propose.');
  const built = [];
  for (const target of wanted) {
    const output = await render(target.format, source.text, path.posix.basename(proposal.source));
    built.push({ format: target.format, warnings: output.warnings, ...writeDeliverable(root, { need: proposal.need, path: target.path, bytes: output.bytes }) });
  }
  withState(home, state => { const current = state.proposals.find(p => p.id === id); if (current) Object.assign(current, { status: 'built', builtAt: new Date().toISOString(), outputs: built.map(b => b.path) }); });
  return { id, need: proposal.need, source: proposal.source, built };
}
export function dismissProposal(home, { id }) {
  ensure(typeof id === 'string' && /^[0-9a-f]{12}$/.test(id), 'FILES_PROPOSAL_INVALID');
  return withState(home, state => {
    const current = state.proposals.find(p => p.id === id);
    ensure(current, 'FILES_PROPOSAL_NOT_FOUND');
    ensure(current.status === 'proposed', 'FILES_PROPOSAL_CLOSED', 'Proposta ' + id + ' está ' + current.status + '.');
    current.status = 'dismissed'; current.dismissedAt = new Date().toISOString();
    return { value: { id, status: 'dismissed' } };
  });
}
