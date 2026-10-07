import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { BrainStore, V1_BACKUP } from '../src/store.mjs';
import { indexProject, refreshFiles, resolveLimits, search } from '../src/retrieval.mjs';
import { compileContext } from '../src/context.mjs';
import { saveCheckpoint } from '../src/session.mjs';
import { makeEngine } from '../src/engine.mjs';
import { evaluateRetrieval } from '../src/evaluation.mjs';
import { classify, definitions, splitIdentifier } from '../src/analyze.mjs';

function workspace(t, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbrainx-turbo-')), root = path.join(dir, 'repo');
  fs.mkdirSync(root);
  for (const [name, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, name)), {recursive:true}); fs.writeFileSync(path.join(root, name), body); }
  const store = new BrainStore(path.join(dir, 'state')); store.register('test', root);
  t.after(() => { store.close(); fs.rmSync(dir, {recursive:true, force:true}); });
  return {dir, root, store};
}

// ── análise ────────────────────────────────────────────────────────────────
test('identifier splitting, file classes and declared names', () => {
  assert.deepEqual(splitIdentifier('eraseUserData'), ['erase','user','data']);
  assert.deepEqual(splitIdentifier('HTTPServer_v2'), ['http','server','v2']);
  assert.deepEqual(splitIdentifier('plain'), []);
  assert.equal(classify('src/pay.ts'), 'source');
  assert.equal(classify('src/__tests__/pay.test.ts'), 'test');
  assert.equal(classify('pkg/pay_test.go'), 'test');
  assert.equal(classify('ui/Button.stories.tsx'), 'test');
  assert.equal(classify('docs/GUIDE.md'), 'doc');
  assert.equal(classify('src/types/db.generated.ts'), 'generated');
  assert.match(definitions('export async function settleInvoice(id) {\n  if (id) { return 1; }\n}', '.ts'), /^settleInvoice settle invoice$/);
  assert.match(definitions('class LedgerBook:\n    def close_period(self):\n        pass', '.py'), /LedgerBook ledger book close_period close period/);
  assert.equal(definitions('  if (ready) {\n    run();\n  }', '.ts'), '');
});

// ── ordenação ──────────────────────────────────────────────────────────────
function crowded(t) {
  const files = {'src/billing/pay.ts':'import { ledger } from "./ledger";\n\nexport async function settleInvoice(invoiceId: string) {\n  return ledger.close(invoiceId);\n}\n'};
  for (let i = 0; i < 14; i++) files['src/__tests__/pay-' + i + '.test.ts'] = Array.from({length:8}, (_, n) => 'it("case ' + n + '", async () => { expect(await settleInvoice("inv-' + i + '-' + n + '")).toBeTruthy(); settleInvoice("again"); });').join('\n');
  files['docs/BILLING.md'] = '# Billing\nCall settleInvoice after the payment clears. settleInvoice is idempotent.\n';
  return workspace(t, files);
}
test('a declaration outranks the tests and docs that mention it more often', t => {
  const {store} = crowded(t); indexProject(store, 'test');
  const {items} = search(store, 'test', 'settleInvoice');
  assert.equal(items[0].path, 'src/billing/pay.ts');
  assert.equal(items[0].declares, true);
  assert.ok(items.length > 5 && items.slice(1).some(x => x.kind === 'test'));
});
test('a declaration outranks other source files that use the name', t => {
  const files = {'src/core/ledger.ts':'export function settleInvoice(invoiceId: string) {\n  return invoiceId.length > 0;\n}\n'};
  for (let i = 0; i < 10; i++) files['src/routes/route' + i + '.ts'] = Array.from({length:6}, (_, n) => 'await settleInvoice(order' + n + '.id); log(settleInvoice);').join('\n');
  const {store} = workspace(t, files); indexProject(store, 'test');
  const {items} = search(store, 'test', 'settleInvoice');
  assert.equal(items[0].path, 'src/core/ledger.ts');
  assert.ok(items.slice(1).every(x => x.kind === 'source' && !x.declares));
});
test('hostile single-line files index in linear time', t => {
  const {store} = workspace(t, {
    'spaces.js':'function' + ' '.repeat(240000) + '(',
    'method.ts':' name(' + 'a'.repeat(120000) + ')' + ' '.repeat(120000) + ':',
    'upper.js':'const ' + 'A'.repeat(240000) + ' = 1;'
  });
  const begin = performance.now(), result = indexProject(store, 'test');
  assert.equal(result.files, 3);
  assert.ok(performance.now() - begin < 3000, 'indexação levou ' + Math.round(performance.now() - begin) + ' ms');
  // Linhas abaixo do corte de comprimento: aqui só o quantificador limitado segura o custo.
  const crowded = Array.from({length:120}, () => 'function' + ' '.repeat(1980) + '(').join('\n'), start = performance.now();
  assert.equal(definitions(crowded, '.js'), '');
  assert.ok(performance.now() - start < 250, 'análise levou ' + Math.round(performance.now() - start) + ' ms');
});
test('words and snake_case find a camelCase declaration', t => {
  const {store} = crowded(t); indexProject(store, 'test');
  assert.equal(search(store, 'test', 'settle invoice').items[0].path, 'src/billing/pay.ts');
  assert.equal(search(store, 'test', 'settle_invoice').items[0].path, 'src/billing/pay.ts');
});
test('a camelCase query finds a snake_case declaration in another language', t => {
  const {store} = workspace(t, {'jobs/ledger.py':'def close_billing_period(period):\n    return period\n', 'notes.md':'billing period closes at midnight; the period is monthly\n'.repeat(20)});
  indexProject(store, 'test');
  const {items} = search(store, 'test', 'closeBillingPeriod');
  assert.equal(items.length, 1); assert.equal(items[0].path, 'jobs/ledger.py');
});
test('asking for tests lifts the test penalty', t => {
  const {store} = crowded(t); indexProject(store, 'test');
  const plain = search(store, 'test', 'settleInvoice case').items, asking = search(store, 'test', 'settleInvoice case tests').items;
  const best = list => Math.max(...list.filter(x => x.kind === 'test').map(x => x.score / -x.rank));
  assert.ok(Math.abs(best(plain) - 0.4) < 1e-9); assert.ok(Math.abs(best(asking) - 1) < 1e-9);
});
test('labeled retrieval over this repository keeps a minimum quality', t => {
  const repository = fileURLToPath(new URL('../', import.meta.url)), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbrainx-self-'));
  const store = new BrainStore(dir); t.after(() => { store.close(); fs.rmSync(dir, {recursive:true, force:true}); });
  store.register('self', repository); indexProject(store, 'self');
  const cases = JSON.parse(fs.readFileSync(new URL('./fixtures/eval-self.cases', import.meta.url), 'utf8'));
  const report = evaluateRetrieval(store, 'self', cases);
  assert.equal(report.total.cases, cases.length);
  assert.ok(report.byKind.identificador.hit1 >= 0.9, 'identificador hit@1 = ' + report.byKind.identificador.hit1);
  assert.ok(report.byKind.palavras.hit3 >= 0.8, 'palavras hit@3 = ' + report.byKind.palavras.hit3);
  assert.ok(report.total.mrr >= 0.6, 'MRR total = ' + report.total.mrr);
});

// ── índice ─────────────────────────────────────────────────────────────────
test('limits come from the host, fail with an actionable message and can be raised', t => {
  const {store} = workspace(t, {'a.md':'x'.repeat(40000), 'b.md':'y'.repeat(40000)});
  assert.throws(() => indexProject(store, 'test', {maxBytes:65536}), e => e.code === 'INDEX_BYTE_LIMIT' && /BBRAINX_MAX_BYTES/.test(e.message));
  assert.throws(() => indexProject(store, 'test', {maxFiles:1}), e => e.code === 'INDEX_FILE_LIMIT' && /BBRAINX_MAX_FILES/.test(e.message));
  assert.equal(indexProject(store, 'test', {maxBytes:131072}).files, 2);
  assert.equal(resolveLimits({}, {BBRAINX_MAX_FILES:'123'}).maxFiles, 123);
  assert.throws(() => resolveLimits({}, {BBRAINX_MAX_FILES:'-5'}), {code:'INVALID_LIMIT'});
  assert.throws(() => resolveLimits({}, {BBRAINX_MAX_BYTES:'abc'}), {code:'INVALID_LIMIT'});
});
test('a file that is not valid UTF-8 is skipped instead of aborting the index', t => {
  const {store, root} = workspace(t, {'ok.md':'VALID_MARKER'});
  fs.writeFileSync(path.join(root, 'latin1.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9]));
  const result = indexProject(store, 'test');
  assert.equal(result.files, 1);
  assert.deepEqual(result.skipped, [{path:'latin1.txt', reason:'INVALID_UTF8'}]);
  assert.deepEqual(result.skippedByReason, {INVALID_UTF8:1});
});
test('paths listed by Git but absent from disk do not count against the file limit', t => {
  const {store, root} = workspace(t, {'kept.md':'KEPT_MARKER', 'sparse-a.md':'a', 'sparse-b.md':'b'});
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], {stdio:'pipe'});
  git('init', '-q'); git('add', '.'); git('commit', '-q', '-m', 'init');
  fs.rmSync(path.join(root, 'sparse-a.md')); fs.rmSync(path.join(root, 'sparse-b.md')); // como num checkout esparso: no índice do Git, fora do disco
  const result = indexProject(store, 'test', {maxFiles:1});
  assert.equal(result.files, 1); assert.deepEqual(result.skippedByReason, {ENOENT:2});
});
test('files carrying well-known credential formats stay out of the index', t => {
  // Montadas em tempo de execução: nenhum valor com forma de credencial fica escrito neste arquivo.
  const shaped = {'aws.md':'AKIA' + 'A'.repeat(16), 'google.md':'AIza' + 'b'.repeat(35), 'slack.md':'xoxb-' + '1'.repeat(24), 'stripe.md':'sk_' + 'live_' + 'c'.repeat(24), 'pat.md':'github_pat_' + 'd'.repeat(40)};
  const files = {'clean.md':'CLEAN_MARKER sk_test_fake AKIA-not-a-key'};
  for (const [name, value] of Object.entries(shaped)) files[name] = 'token: ' + value + '\n';
  const {store} = workspace(t, files);
  const result = indexProject(store, 'test');
  assert.equal(result.files, 1);
  assert.deepEqual(result.skippedByReason, {SECRET_PATTERN_REJECTED:5});
  assert.equal(search(store, 'test', 'CLEAN_MARKER').items.length, 1);
});
test('the search index follows an in-place update of a chunk', t => {
  const {store} = workspace(t, {'a.md':'BEFORE_MARKER'}); indexProject(store, 'test');
  store.db.exec("UPDATE chunks SET body='AFTER_MARKER', symbols='after marker'");
  store.db.exec("INSERT INTO chunk_search(chunk_search,rank) VALUES('integrity-check',1)");
  assert.equal(search(store, 'test', 'AFTER_MARKER').items.length, 1); assert.equal(search(store, 'test', 'BEFORE_MARKER').items.length, 0);
});
test('the search index follows deletions and survives a backup', t => {
  const {store, root, dir} = workspace(t, {'a.md':'ALPHA_MARKER', 'b.md':'BETA_MARKER'});
  indexProject(store, 'test'); fs.rmSync(path.join(root, 'a.md')); indexProject(store, 'test');
  assert.equal(search(store, 'test', 'ALPHA_MARKER').items.length, 0);
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM chunk_search WHERE chunk_search MATCH '\"alpha marker\"'").get().n, 0);
  const copy = path.join(dir, 'copy.sqlite'); store.backup(copy);
  const db = new DatabaseSync(copy); // a cópia é descartável: o comando de verificação do FTS5 é um INSERT
  try {
    db.exec("INSERT INTO chunk_search(chunk_search,rank) VALUES('integrity-check',1)"); // lança se o índice divergir de chunks
    assert.equal(db.prepare("SELECT c.path FROM chunk_search JOIN chunks c ON c.seq=chunk_search.rowid WHERE chunk_search MATCH '\"beta marker\"'").get().path, 'b.md');
  } finally { db.close(); }
});

// ── arquivo alterado depois do índice ──────────────────────────────────────
test('a changed file is re-read before being served and the snapshot matches a full index', t => {
  const {store, root} = workspace(t, {'auth.ts':'export function authenticate(token: string) {\n  return token.length > 0;\n}\n', 'README.md':'# Authentication\nNever log credentials.\n'});
  const before = indexProject(store, 'test');
  fs.writeFileSync(path.join(root, 'auth.ts'), 'export function authenticate(token: string) {\n  return token === "FRESH_CONTENT";\n}\n');
  const pack = compileContext(store, {project:'test', query:'authenticate'});
  assert.match(pack.text, /FRESH_CONTENT/);
  assert.deepEqual(pack.refreshedFiles, ['auth.ts']);
  assert.notEqual(pack.snapshot, before.snapshot);
  const full = indexProject(store, 'test');
  assert.equal(full.changed, 0); assert.equal(full.snapshot, pack.snapshot);
  assert.equal(store.events('test').filter(x => x.type === 'index.refreshed').length, 1);
});
test('a deleted file or one that gained a secret leaves the index instead of being served', t => {
  const {store, root} = workspace(t, {'gone.md':'authenticate DELETED_MARKER', 'leak.md':'authenticate LEAK_MARKER', 'keep.md':'authenticate KEPT_MARKER'});
  indexProject(store, 'test');
  fs.rmSync(path.join(root, 'gone.md'));
  fs.appendFileSync(path.join(root, 'leak.md'), '\n-----BEGIN RSA PRIVATE KEY-----\n');
  const pack = compileContext(store, {project:'test', query:'authenticate'});
  assert.deepEqual(pack.refreshedFiles, ['gone.md', 'leak.md']);
  assert.match(pack.text, /KEPT_MARKER/); assert.doesNotMatch(pack.text, /DELETED_MARKER|LEAK_MARKER|PRIVATE KEY/);
  assert.equal(search(store, 'test', 'LEAK_MARKER').items.length, 0);
});
test('refresh only touches the given paths and reports what changed', t => {
  const {store, root} = workspace(t, {'a.md':'one', 'b.md':'two'});
  indexProject(store, 'test'); fs.writeFileSync(path.join(root, 'a.md'), 'one changed'); fs.writeFileSync(path.join(root, 'b.md'), 'two changed');
  const result = refreshFiles(store, 'test', ['a.md', 'a.md', 'missing.md']);
  assert.deepEqual(result.changed, ['a.md']); assert.deepEqual(result.removed, []);
  assert.equal(search(store, 'test', 'two').items[0].body, 'two');
});
test('the pack reports the evidence that did not fit the budget', t => {
  const files = {}; for (let i = 0; i < 12; i++) files['doc' + i + '.md'] = ('budget topic line ' + i + ' ').repeat(120);
  const {store} = workspace(t, files); indexProject(store, 'test');
  const pack = compileContext(store, {project:'test', query:'budget topic', budget:900});
  assert.ok(pack.sources.length >= 1 && pack.sources.length < 12);
  assert.equal(pack.sources.length + pack.sourcesOmittedByBudget, 12);
});

// ── checkpoint ─────────────────────────────────────────────────────────────
function gitWorkspace(t) {
  const made = workspace(t, {'app.ts':'export const ready = true;\n'});
  const git = (...args) => execFileSync('git', ['-C', made.root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], {stdio:'pipe'});
  git('init', '-q'); git('add', '.'); git('commit', '-q', '-m', 'init');
  return {...made, head:execFileSync('git', ['-C', made.root, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim()};
}
const base = {objective:'Fix auth', nextAction:'Run the suite', status:'in_progress'};
test('a checkpoint carries what was done, and the host stamps snapshot and Git state', t => {
  const {store, root, head} = gitWorkspace(t); indexProject(store, 'test');
  fs.writeFileSync(path.join(root, 'app.ts'), 'export const ready = false;\n');
  const saved = saveCheckpoint(store, {project:'test', task:'T1', expectedVersion:0, idempotencyKey:'k1', content:{...base, done:['read app.ts'], decisions:['keep the flag'], blockers:[], filesTouched:['app.ts'], evidence:[{command:'npm test', result:'30 passed'}]}});
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.content.done, ['read app.ts']); assert.deepEqual(saved.content.filesTouched, ['app.ts']);
  assert.deepEqual(saved.content.host.git, {head, branch:saved.content.host.git.branch}); assert.ok(saved.content.host.git.branch);
  assert.equal(saved.content.snapshot, store.project('test').snapshot);
  assert.equal(indexProject(store, 'test').changed, 0, 'o checkpoint atestado já tinha reindexado a árvore editada');
  assert.deepEqual(saveCheckpoint(store, {project:'test', task:'T1', expectedVersion:0, idempotencyKey:'k1', content:{...base, done:['read app.ts'], decisions:['keep the flag'], blockers:[], filesTouched:['app.ts'], evidence:[{command:'npm test', result:'30 passed'}]}}), saved);
  assert.equal(store.task('test', 'T1').content.host.git.head, head);
});
test('stamping Git state never runs a filter configured by the repository', t => {
  const {store, root, dir} = gitWorkspace(t), marker = path.join(dir, 'filter-ran');
  fs.writeFileSync(path.join(root, '.gitattributes'), '* filter=probe\n');
  execFileSync('git', ['-C', root, 'config', 'filter.probe.clean', 'sh -c "echo ran >> ' + marker.replaceAll('\\', '/') + '; cat"'], {stdio:'pipe'});
  // Mesmo tamanho e data diferente: é o caso em que o Git precisa reler o conteúdo, e por isso rodaria o filtro.
  fs.writeFileSync(path.join(root, 'app.ts'), 'export const ready = fals;\n');
  const later = new Date(Date.now() + 5000); fs.utimesSync(path.join(root, 'app.ts'), later, later);
  indexProject(store, 'test');
  assert.equal(saveCheckpoint(store, {project:'test', task:'T', expectedVersion:0, idempotencyKey:'k', content:base}).version, 1);
  assert.equal(fs.existsSync(marker), false, 'um filtro clean do repositório foi executado pelo serviço');
});
test('a repeated checkpoint call returns the stored answer without re-indexing, and invalid content never indexes', t => {
  const {store, root} = workspace(t, {'a.md':'one'}); indexProject(store, 'test');
  const indexed = () => store.events('test').filter(x => x.type === 'index.completed').length;
  const first = saveCheckpoint(store, {project:'test', task:'T', expectedVersion:0, idempotencyKey:'k', content:base}), after = indexed();
  fs.writeFileSync(path.join(root, 'a.md'), 'changed after the checkpoint');
  assert.deepEqual(saveCheckpoint(store, {project:'test', task:'T', expectedVersion:0, idempotencyKey:'k', content:base}), first);
  assert.equal(indexed(), after);
  assert.throws(() => saveCheckpoint(store, {project:'test', task:'T', expectedVersion:1, idempotencyKey:'k2', content:{...base, status:'done'}}), {code:'INVALID_STATUS'});
  assert.equal(indexed(), after);
});
test('a checkpoint is capped at 16 KiB; auxiliary history can shrink but decisions remain', t => {
  const {store} = workspace(t, {'a.md':'topic alpha'}); indexProject(store, 'test');
  assert.throws(() => store.checkpoint('test', 'T', {...base, done:Array.from({length:40}, (_, i) => ('step ' + i + ' ').repeat(70))}, 0, 'big'), {code:'PAYLOAD_TOO_LARGE'});
  const done = Array.from({length:30}, (_, i) => 'finished step number ' + i + ' of the long refactor with details '.repeat(4));
  saveCheckpoint(store, {project:'test', task:'T', expectedVersion:0, idempotencyKey:'k', content:{...base, done, decisions:['keep it small']}});
  const small = compileContext(store, {project:'test', query:'alpha', task:'T', budget:900});
  assert.equal(small.checkpointTrimmed, true);
  assert.match(small.text, /lists left out to fit the budget: done 30; read them with session_get/);
  assert.match(small.text, /"decisions":\["keep it small"\]/);
  assert.doesNotMatch(small.text, /lists left out to fit the budget: decisions/);
  assert.match(small.text, /"nextAction":"Run the suite"/); assert.doesNotMatch(small.text, /finished step number 7/);
  const large = compileContext(store, {project:'test', query:'alpha', task:'T', budget:16000});
  assert.equal(large.checkpointTrimmed, false); assert.match(large.text, /finished step number 7/);
});
test('a declared snapshot must still be the current one, and host fields cannot be declared', t => {
  const {store, root} = workspace(t, {'a.md':'one'}); const {snapshot} = indexProject(store, 'test');
  fs.writeFileSync(path.join(root, 'a.md'), 'two'); indexProject(store, 'test');
  assert.throws(() => saveCheckpoint(store, {project:'test', task:'T', expectedVersion:0, idempotencyKey:'a', content:{...base, snapshot}}), {code:'SNAPSHOT_CONFLICT'});
  assert.throws(() => store.checkpoint('test', 'T', {...base, host:{git:{head:'forged'}}}, 0, 'b'), e => e.code === 'INVALID_CHECKPOINT' && /host/.test(e.message));
  assert.throws(() => store.checkpoint('test', 'T', {...base, filesTouched:['../outside.ts']}, 0, 'c'), {code:'INVALID_CHECKPOINT'});
  assert.throws(() => store.checkpoint('test', 'T', {...base, filesTouched:['/etc/passwd']}, 0, 'd'), {code:'INVALID_CHECKPOINT'});
  assert.throws(() => store.checkpoint('test', 'T', {...base, evidence:[{command:'x', result:'y', verified:true}]}, 0, 'e'), {code:'INVALID_CHECKPOINT'});
  assert.throws(() => store.checkpoint('test', 'T', {...base, done:Array.from({length:41}, () => 'x')}, 0, 'f'), {code:'INVALID_CHECKPOINT'});
  assert.equal(store.task('test', 'T'), null);
});
test('a project that was never indexed cannot receive a checkpoint through the store', t => {
  const {store} = workspace(t, {'a.md':'one'});
  assert.throws(() => store.checkpoint('test', 'T', base, 0, 'a'), e => e.code === 'SNAPSHOT_CONFLICT' && /index/.test(e.message));
});

// ── registro e memória ─────────────────────────────────────────────────────
test('registering the same folder under a second name says which name owns it', t => {
  const {store, root} = workspace(t);
  assert.throws(() => store.register('other', root), e => e.code === 'PROJECT_ROOT_ALREADY_REGISTERED' && /"test"/.test(e.message));
  assert.equal(store.register('test', root).id, 'test');
});
test('relevant-only memories enter a pack only when they match the objective, and the omission is stated', t => {
  const {store} = workspace(t, {'README.md':'Billing and authentication notes.'}); indexProject(store, 'test');
  const policy = store.proposeMemory('test', 'Never log credentials', 'ADR-1');
  const note = store.proposeMemory('test', 'Invoices are settled by the ledger worker', 'ADR-2', 'relevant');
  store.reviewMemory('test', policy.id, 'approved', 1); store.reviewMemory('test', note.id, 'approved', 1, 'relevant');
  const unrelated = compileContext(store, {project:'test', query:'authentication'});
  assert.match(unrelated.text, /Never log credentials/); assert.doesNotMatch(unrelated.text, /ledger worker/);
  assert.equal(unrelated.memoriesOmitted, 1); assert.match(unrelated.text, /left out: 1\./);
  const related = compileContext(store, {project:'test', query:'how are invoices settled'});
  assert.match(related.text, /ledger worker/); assert.equal(related.memoriesOmitted, 0);
});
test('the same statement is not proposed twice and approval can change the mode', t => {
  const {store} = workspace(t, {'a.md':'x'}); indexProject(store, 'test');
  const first = store.proposeMemory('test', 'Keep the public contract', 'ADR-3');
  const again = store.proposeMemory('test', 'Keep the public contract', 'chat');
  assert.equal(again.id, first.id); assert.equal(again.duplicate, true);
  assert.equal(store.memories('test').length, 1);
  assert.equal(store.reviewMemory('test', first.id, 'approved', 1, 'relevant').mode, 'relevant');
  const suggested = store.proposeMemory('test', 'Agent suggests a narrow scope', 'chat', 'relevant');
  assert.equal(store.reviewMemory('test', suggested.id, 'approved', 1).mode, 'always', 'aprovar sem escolher o modo não aceita a sugestão do agente');
  assert.throws(() => store.proposeMemory('test', 'Another', 'x', 'sometimes'), {code:'INVALID_MODE'});
  store.reviewMemory('test', first.id, 'revoked', 2);
  assert.equal(store.proposeMemory('test', 'Keep the public contract', 'ADR-3').duplicate, false);
});

// ── motor ──────────────────────────────────────────────────────────────────
test('the engine returns the reason of a domain error and accepts the richer checkpoint', async t => {
  const {store} = workspace(t, {'a.md':'one'}); const engine = makeEngine(store, ['test']), principal = {principal:{id:'client'}};
  const early = await engine.invoke('context.bootstrap', {project:'test', query:'one'}, principal);
  assert.deepEqual(early, {ok:false, data:null, error:'INDEX_REQUIRED', detail:null});
  const saved = await engine.invoke('session.checkpoint', {project:'test', task:'T', expectedVersion:0, idempotencyKey:'k', content:{...base, done:['indexed'], filesTouched:['a.md']}}, principal);
  assert.equal(saved.ok, true); assert.deepEqual(saved.data.content.done, ['indexed']); assert.equal(saved.data.content.host.git, null);
  const conflict = await engine.invoke('session.checkpoint', {project:'test', task:'T', expectedVersion:0, idempotencyKey:'k2', content:{...base, snapshot:'0'.repeat(64)}}, principal);
  assert.equal(conflict.error, 'SNAPSHOT_CONFLICT'); assert.match(conflict.detail, /snapshot informado/);
  await assert.rejects(() => engine.invoke('session.checkpoint', {project:'test', task:'T', expectedVersion:0, idempotencyKey:'k3', content:{...base, host:{}}}, principal));
});

// ── migração ───────────────────────────────────────────────────────────────
const schemaV1 = `
CREATE TABLE projects(id TEXT PRIMARY KEY, root TEXT NOT NULL UNIQUE, created TEXT NOT NULL, snapshot TEXT);
CREATE TABLE files(project TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL, hash TEXT NOT NULL, bytes INTEGER NOT NULL, PRIMARY KEY(project,path));
CREATE TABLE chunks(id TEXT PRIMARY KEY, project TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL, file_hash TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, body TEXT NOT NULL);
CREATE VIRTUAL TABLE chunk_search USING fts5(id UNINDEXED, project UNINDEXED, path, body, tokenize='unicode61');
CREATE TABLE tasks(project TEXT NOT NULL REFERENCES projects(id), id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(project,id));
CREATE TABLE task_history(project TEXT NOT NULL, task TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(project,task,version));
CREATE TABLE memories(id TEXT PRIMARY KEY, project TEXT NOT NULL REFERENCES projects(id), statement TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('proposed','approved','revoked')), version INTEGER NOT NULL, created TEXT NOT NULL);
CREATE TABLE idempotency(project TEXT NOT NULL, operation TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(project,operation,key));
CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, project TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;
function databaseV1(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbrainx-v1-')), home = path.join(dir, 'state'), root = path.join(dir, 'repo');
  fs.mkdirSync(home); fs.mkdirSync(root); fs.writeFileSync(path.join(root, 'a.md'), 'MIGRATED_MARKER');
  const db = new DatabaseSync(path.join(home, 'brain.sqlite'));
  db.exec(schemaV1 + 'PRAGMA user_version=1;');
  db.prepare('INSERT INTO meta VALUES(?,?)').run('schema', '5e4aaf7f64696418b88d9a77f457a74a3c2c82a301f2359800d83c4f1e4b87fc');
  db.prepare('INSERT INTO projects VALUES(?,?,?,?)').run('legacy', fs.realpathSync(root), '2026-10-04T00:00:00.000Z', 'a'.repeat(64));
  db.prepare('INSERT INTO files VALUES(?,?,?,?)').run('legacy', 'a.md', 'b'.repeat(64), 15);
  db.prepare('INSERT INTO chunks VALUES(?,?,?,?,?,?,?)').run('c1', 'legacy', 'a.md', 'b'.repeat(64), 1, 1, 'MIGRATED_MARKER');
  db.prepare('INSERT INTO chunk_search VALUES(?,?,?,?)').run('c1', 'legacy', 'a.md', 'MIGRATED_MARKER');
  db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?)').run('legacy', 'T1', 3, '{"nextAction":"Review","objective":"Keep","snapshot":"' + 'a'.repeat(64) + '","status":"paused"}', '2026-10-04T00:00:00.000Z');
  db.prepare('INSERT INTO task_history VALUES(?,?,?,?,?)').run('legacy', 'T1', 3, '{}', '2026-10-04T00:00:00.000Z');
  db.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?)').run('m1', 'legacy', 'Keep the contract', 'ADR', 'approved', 2, '2026-10-04T00:00:00.000Z');
  db.close();
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  return {home, root};
}
test('a version 1 database migrates keeping tasks and memories, and leaves a restorable copy', t => {
  const {home} = databaseV1(t);
  fs.writeFileSync(path.join(home, V1_BACKUP), 'sobra de uma tentativa anterior'); // cópia velha não pode ser reaproveitada
  const store = new BrainStore(home);
  try {
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 2);
    assert.equal(store.project('legacy').snapshot, null);
    assert.equal(store.task('legacy', 'T1').version, 3); assert.equal(store.task('legacy', 'T1').content.nextAction, 'Review');
    assert.deepEqual(store.memories('legacy', true).map(x => [x.statement, x.mode]), [['Keep the contract', 'always']]);
    assert.equal(store.events('legacy').at(-1).type, 'schema.migrated');
    assert.throws(() => compileContext(store, {project:'legacy', query:'marker'}), {code:'INDEX_REQUIRED'});
    assert.equal(indexProject(store, 'legacy').files, 1);
    assert.equal(search(store, 'legacy', 'MIGRATED_MARKER').items[0].path, 'a.md');
    assert.match(compileContext(store, {project:'legacy', query:'marker', task:'T1'}).text, /WARNING: checkpoint belongs to a different snapshot/);
  } finally { store.close(); }
  const copy = new DatabaseSync(path.join(home, V1_BACKUP), {readOnly:true});
  try {
    assert.equal(copy.prepare('PRAGMA user_version').get().user_version, 1);
    assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(copy.prepare('SELECT version FROM tasks WHERE id=?').get('T1').version, 3);
    assert.equal(copy.prepare('SELECT count(*) AS n FROM chunks').get().n, 1);
  } finally { copy.close(); }
  const reopened = new BrainStore(home); // segunda abertura: nada a migrar, a cópia não é reescrita
  try { assert.equal(reopened.events('legacy').filter(x => x.type === 'schema.migrated').length, 1); } finally { reopened.close(); }
});
test('rollback: the copy made before the migration opens as a working version 1 database', t => {
  const {home} = databaseV1(t); new BrainStore(home).close();
  const restored = path.join(home, 'restored'); fs.mkdirSync(restored); fs.copyFileSync(path.join(home, V1_BACKUP), path.join(restored, 'brain.sqlite'));
  const db = new DatabaseSync(path.join(restored, 'brain.sqlite'));
  try {
    assert.equal(db.prepare('SELECT value FROM meta WHERE key=?').get('schema').value, '5e4aaf7f64696418b88d9a77f457a74a3c2c82a301f2359800d83c4f1e4b87fc');
    assert.equal(db.prepare("SELECT body FROM chunk_search WHERE chunk_search MATCH 'migrated_marker'").get().body, 'MIGRATED_MARKER');
    assert.equal(db.prepare("SELECT count(*) AS n FROM pragma_table_info('memories') WHERE name='mode'").get().n, 0);
  } finally { db.close(); }
});
test('an unknown schema version or a tampered version 1 is refused, not overwritten', t => {
  const {home} = databaseV1(t);
  const db = new DatabaseSync(path.join(home, 'brain.sqlite')); db.prepare('UPDATE meta SET value=? WHERE key=?').run('tampered', 'schema'); db.close();
  assert.throws(() => new BrainStore(home), {code:'MIGRATION_REQUIRED'});
  const again = new DatabaseSync(path.join(home, 'brain.sqlite')); again.exec('PRAGMA user_version=9'); again.close();
  assert.throws(() => new BrainStore(home), {code:'MIGRATION_REQUIRED'});
  const check = new DatabaseSync(path.join(home, 'brain.sqlite'), {readOnly:true});
  try { assert.equal(check.prepare('SELECT count(*) AS n FROM chunks').get().n, 1); } finally { check.close(); }
});
