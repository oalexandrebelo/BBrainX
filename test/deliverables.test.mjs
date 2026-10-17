import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openNeed, writeText } from '../src/files.mjs';
import { versionGroups, analyze, analyzeIfDue, listProposals, buildProposal, dismissProposal, ANALYSIS_INTERVAL_MS } from '../src/deliverables.mjs';
import { unzip, extractPdfText } from '../src/formats.mjs';

function sandbox(t) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bb-deliv-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'Projetos'), home = path.join(base, 'state');
  fs.mkdirSync(root); fs.mkdirSync(home);
  return { root, home };
}

test('versions of the same file group together; the latest is the highest number; "-1" in a name is not a version', () => {
  const groups = versionGroups([
    { path: 'proposta.md', text: true }, { path: 'proposta-3.md', text: true }, { path: 'proposta-2.md', text: true },
    { path: 'docs/proposta.md', text: true }, { path: 'fase-1.md', text: true }, { path: 'dados.csv', text: true },
    { path: 'proposta.pdf', text: false }, { path: 'script.js', text: true }]);
  const byBase = Object.fromEntries(groups.map(g => [g.base, g]));
  assert.deepEqual(Object.keys(byBase).sort(), ['dados.csv', 'docs/proposta.md', 'fase-1.md', 'proposta.md']);
  assert.equal(byBase['proposta.md'].latest.path, 'proposta-3.md');assert.equal(byBase['proposta.md'].versions.length, 3);
  assert.equal(byBase['fase-1.md'].latest.path, 'fase-1.md');
});

test('the daily analysis proposes PDF+DOCX from md and XLSX from csv, runs once a day, and a changed source supersedes its proposal', t => {
  const { root, home } = sandbox(t), { need } = openNeed(root, { name: 'proposta cliente' });
  writeText(root, { need, path: 'proposta.md', content: '# Proposta\n\nv1\n' });
  writeText(root, { need, path: 'proposta.md', content: '# Proposta\n\nv2 com **valor**\n' });
  writeText(root, { need, path: 'custos.csv', content: 'item;valor\nhoras;1.234,56\n' });
  const now = Date.parse('2026-10-16T12:00:00Z');
  const first = analyzeIfDue(root, home, { now });
  assert.deepEqual([first.due, first.added, first.needs], [true, 2, 1]);
  assert.deepEqual(analyzeIfDue(root, home, { now: now + 3600000 }).due, false, 'not again within 24 h');
  const open = listProposals(home).items;
  const md = open.find(p => p.base === 'proposta.md'), csv = open.find(p => p.base === 'custos.csv');
  assert.equal(md.source, 'proposta-2.md');assert.deepEqual(md.targets.map(x => x.path), ['proposta.pdf', 'proposta.docx']);
  assert.match(md.prompt, /^2 versões de proposta\.md: gerar proposta\.pdf e proposta\.docx a partir de proposta-2\.md\?$/);
  assert.deepEqual(csv.targets.map(x => x.path), ['custos.xlsx']);
  writeText(root, { need, path: 'proposta.md', content: '# Proposta\n\nv3\n' });
  const later = analyzeIfDue(root, home, { now: now + ANALYSIS_INTERVAL_MS + 1 });
  assert.equal(later.added, 1);
  assert.equal(listProposals(home, { status: 'superseded' }).items[0].id, md.id);
  assert.equal(listProposals(home).items.find(p => p.base === 'proposta.md').source, 'proposta-3.md');
});

test('building needs an open proposal and an unchanged source; outputs are real PDF, DOCX and XLSX and never overwrite', async t => {
  const { root, home } = sandbox(t), { need } = openNeed(root, { name: 'entrega' });
  writeText(root, { need, path: 'relatorio.md', content: '# Relatório de Ação\n\nTexto com acentuação: ação, missão, pé.\n\n- item um\n- item dois\n' });
  writeText(root, { need, path: 'tabela.csv', content: 'nome,valor\nalfa,10\nbeta,20.5\n' });
  fs.writeFileSync(path.join(root, need, 'relatorio.pdf'), 'já existia');
  analyze(root, home);
  const proposals = listProposals(home).items, md = proposals.find(p => p.base === 'relatorio.md'), csv = proposals.find(p => p.base === 'tabela.csv');
  const built = await buildProposal(root, home, { id: md.id });
  assert.deepEqual(built.built.map(b => b.path), ['relatorio-2.pdf', 'relatorio.docx'], 'the existing relatorio.pdf is kept');
  assert.equal(fs.readFileSync(path.join(root, need, 'relatorio.pdf'), 'utf8'), 'já existia');
  const pdf = fs.readFileSync(path.join(root, need, 'relatorio-2.pdf'));
  assert.equal(pdf.subarray(0, 8).toString('latin1'), '%PDF-1.4');assert.match(extractPdfText(pdf), /Relatório de Ação/);
  const docx = unzip(fs.readFileSync(path.join(root, need, 'relatorio.docx')));
  assert.match(docx.get('word/document.xml').toString('utf8'), /Relatório de Ação/);
  const sheet = await buildProposal(root, home, { id: csv.id });
  const xlsx = unzip(fs.readFileSync(path.join(root, need, sheet.built[0].path)));
  assert.match(xlsx.get('xl/worksheets/sheet1.xml').toString('utf8'), /<v>20\.5<\/v>/);
  await assert.rejects(buildProposal(root, home, { id: md.id }), { code: 'FILES_PROPOSAL_CLOSED' });
  assert.equal(listProposals(home, { status: 'built' }).items.length, 2);
  // Fonte alterada depois da proposta: recusa, nada é gerado.
  writeText(root, { need, path: 'notas.txt', content: 'nota' });
  analyze(root, home);
  const txt = listProposals(home).items.find(p => p.base === 'notas.txt');
  fs.appendFileSync(path.join(root, need, 'notas.txt'), ' alterada');
  await assert.rejects(buildProposal(root, home, { id: txt.id }), { code: 'FILES_PROPOSAL_STALE' });
  assert.equal(dismissProposal(home, { id: txt.id }).status, 'dismissed');
  assert.throws(() => dismissProposal(home, { id: txt.id }), { code: 'FILES_PROPOSAL_CLOSED' });
  assert(!fs.readdirSync(path.join(root, need)).some(n => n.startsWith('notas.') && n !== 'notas.txt'));
});
