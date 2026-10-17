import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrainStore } from '../src/store.mjs';
import { indexProject, inspectIndex, search, clearScanCache } from '../src/retrieval.mjs';
import { makeEngine } from '../src/engine.mjs';
import { textToPdf, markdownToDocx, csvToXlsx, zip } from '../src/formats.mjs';
import { extractDocument } from '../src/extract.mjs';

// PDF, DOCX e XLSX entram na busca pelo texto extraído; nada é gravado ao lado deles.
function folder(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bb-docs-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'proposta.pdf'), textToPdf('# Proposta Comercial\n\nCláusula de reajuste anual pelo índice zircônio.\n', { title: 'proposta.md' }).buffer);
  fs.writeFileSync(path.join(root, 'contrato.docx'), markdownToDocx('# Contrato\n\nO prazo de vigência é de vinte e quatro meses, renovável por ametista.\n'));
  fs.writeFileSync(path.join(root, 'custos.xlsx'), csvToXlsx('item;valor\nlicença turquesa;1.500,00\n'));
  // PDF sem camada de texto, como um escaneado: pulado com o motivo declarado, sem derrubar o índice.
  fs.writeFileSync(path.join(root, 'escaneado.pdf'), Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'));
  const store = new BrainStore(path.join(root, '.state'));t.after(() => store.close());
  store.register('d', root);
  return { root, store };
}

test('text inside PDF, DOCX and XLSX is searchable; an empty scanned PDF is skipped with its reason', t => {
  const { root, store } = folder(t);
  const result = indexProject(store, 'd');
  assert.equal(result.skippedByReason.DOCUMENT_TEXT_EMPTY, 1, JSON.stringify(result.skippedByReason));
  const found = query => search(store, 'd', query).items.map(i => i.path);
  assert.equal(found('zircônio')[0], 'proposta.pdf');
  assert.equal(found('ametista')[0], 'contrato.docx');
  assert.equal(found('turquesa')[0], 'custos.xlsx');
  assert.equal(search(store, 'd', 'turquesa').items[0].kind, 'doc');
  assert.deepEqual(fs.readdirSync(root).sort(), ['.state', 'contrato.docx', 'custos.xlsx', 'escaneado.pdf', 'proposta.pdf'], 'nothing is written next to the documents');
});

test('freshness compares the original bytes, and context_read returns the extracted text', async t => {
  const { root, store } = folder(t);
  indexProject(store, 'd');
  assert.equal(inspectIndex(store, 'd').status, 'current');
  const engine = makeEngine(store, ['d']);
  const read = await engine.invoke('context.read', { project: 'd', path: 'contrato.docx' }, { principal: { id: 'host' } });
  assert.equal(read.ok, true, JSON.stringify(read));assert.match(JSON.stringify(read.data), /vinte e quatro meses/);
  fs.writeFileSync(path.join(root, 'contrato.docx'), markdownToDocx('# Contrato\n\nNovo prazo de doze meses.\n'));
  clearScanCache();
  assert.equal(inspectIndex(store, 'd').status, 'stale');
  indexProject(store, 'd');
  assert.equal(search(store, 'd', 'doze meses').items[0].path, 'contrato.docx');
});

test('a credential inside a document keeps it out of the index; other systems use the built-in PDF extractor', t => {
  const { root, store } = folder(t);
  fs.writeFileSync(path.join(root, 'segredo.docx'), markdownToDocx('chave sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\n'));
  const result = indexProject(store, 'd');
  assert.equal(result.skippedByReason.SECRET_PATTERN_REJECTED, 1);
  assert(!search(store, 'd', 'chave').items.some(i => i.path === 'segredo.docx'));
  const bytes = fs.readFileSync(path.join(root, 'proposta.pdf'));
  assert.match(extractDocument(path.join(root, 'proposta.pdf'), '.pdf', bytes, { platform: 'linux' }), /zircônio/);
  assert.throws(() => extractDocument('/x.docx', '.docx', zip([{ name: 'outro.xml', data: '<a/>' }])), { code: 'DOCUMENT_UNREADABLE' });
});

test('a deliverable built in the needs folder is searchable right after the build', async t => {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bb-docs-build-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const filesRoot = path.join(base, 'Projetos'), home = path.join(base, 'state');
  fs.mkdirSync(filesRoot);
  const store = new BrainStore(home);t.after(() => store.close());
  const { openNeed, writeText } = await import('../src/files.mjs');
  const { analyze, listProposals } = await import('../src/deliverables.mjs');
  const { need } = openNeed(filesRoot, { name: 'entrega' });
  writeText(filesRoot, { need, path: 'relatorio.md', content: '# Relatório\n\nPalavra rara: obsidiana-azul.\n' });
  store.register('projetos', filesRoot);indexProject(store, 'projetos');
  analyze(filesRoot, home);
  const id = listProposals(home).items[0].id;
  const engine = makeEngine(store, ['projetos'], { files: true, filesOptions: { env: { BBRAINX_FILES_ROOT: filesRoot } } });
  const built = await engine.invoke('files.build', { project: 'projetos', proposalId: id, formats: ['pdf'] }, { principal: { id: 'host' } });
  assert.equal(built.ok, true, JSON.stringify(built));
  assert(search(store, 'projetos', 'obsidiana').items.some(i => i.path.endsWith('relatorio.pdf')), 'the new PDF is in the index');
});
