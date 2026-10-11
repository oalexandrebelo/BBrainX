import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SharedAdmission } from '../src/shared-admission.mjs';
const out = path.resolve(process.argv[2] ?? 'artifacts/shared-admission/benchmark'); fs.mkdirSync(out, { recursive: true });
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-admission-bench-')), H = c => c.repeat(64);
const db = new SharedAdmission(home); let read;
const percentile = (data, p) => [...data].sort((a, b) => a - b)[Math.max(0, Math.ceil(p * data.length) - 1)];
const quantiles = data => ({ n: data.length, p50: percentile(data, .5), p95: percentile(data, .95), p99: percentile(data, .99), max: Math.max(...data) });
try {
  db.registerResource({ id: 'neural', physicalKey: H('a'), slots: 2, byteLimit: 100 });
  const request = { resource: 'neural', bytes: 20, scopeDigest: H('b'), requestDigest: H('c') };
  const cycle = () => { const a = db.acquire(request); assert(a.ok); db.release(a.handle, { expectedRevision: 1, evidenceDigest: H('d') }); };
  for (let i = 0; i < 100; i++) cycle();
  const acquisitionMs = [], releaseMs = [];
  for (let i = 0; i < 1000; i++) {
    const t = performance.now(), a = db.acquire(request), t2 = performance.now();
    assert(a.ok); db.release(a.handle, { expectedRevision: 1, evidenceDigest: H('d') });
    acquisitionMs.push(t2 - t); releaseMs.push(performance.now() - t2);
  }
  // Dados produzidos pela API real: 10.000 reservas encerradas, uma ativa.
  while (db.inspect().issued < 10000) cycle();
  db.acquire(request); read = new DatabaseSync(db.location, { readOnly: true });
  const query = hint => `SELECT count(*) AS n,coalesce(sum(bytes),0) AS bytes FROM admission_reservations ${hint} WHERE resource_id=? AND state IN ('running','unknown')`;
  const scanSQL = query('NOT INDEXED'), indexedSQL = query('INDEXED BY admission_active');
  const scan = read.prepare(scanSQL), indexed = read.prepare(indexedSQL), expected = { n: 1, bytes: 20 };
  assert.deepEqual({ ...scan.get('neural') }, expected); assert.deepEqual({ ...indexed.get('neural') }, expected);
  const measure = statement => {
    let n = 0, bytes = 0; const start = performance.now();
    for (let i = 0; i < 1000; i++) { const r = statement.get('neural'); n += r.n; bytes += r.bytes; }
    const durationMs = performance.now() - start; assert.equal(n, 1000); assert.equal(bytes, 20000); return durationMs;
  };
  for (let i = 0; i < 50; i++) { scan.get('neural'); indexed.get('neural'); }
  const pairs = [];
  for (let i = 0; i < 7; i++) {
    let scanMs, indexedMs;
    if (i % 2 === 0) { scanMs = measure(scan); indexedMs = measure(indexed); }
    else { indexedMs = measure(indexed); scanMs = measure(scan); }
    pairs.push({ repetition: i + 1, order: i % 2 ? 'index-first' : 'scan-first', scanMs, indexedMs, ratio: scanMs / indexedMs });
  }
  const source = fs.readFileSync(fileURLToPath(new URL('../src/shared-admission.mjs', import.meta.url)));
  const report = {
    schemaVersion: 1, kind: 'local-ledger-and-same-result-query-microbenchmark', observedAt: new Date().toISOString(),
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    environment: { node: process.version, platform: process.platform, arch: process.arch, release: os.release(),
      cpus: os.cpus().length, memoryBytes: os.totalmem(), sqlite: read.prepare('SELECT sqlite_version() AS version').get().version,
      filesystem: 'temporary-container-filesystem-not-classified', nativeMedium: false },
    latencyMs: { acquire: quantiles(acquisitionMs), release: quantiles(releaseMs) },
    raw: { acquisitionMs, releaseMs },
    queryComparison: { sameResultVerified: true, completedRows: 10000, activeRows: 1, queriesPerArmPerPair: 1000, pairs,
      medianRatio: percentile(pairs.map(p => p.ratio), .5), scanPlan: read.prepare('EXPLAIN QUERY PLAN ' + scanSQL).all('neural'),
      indexedPlan: read.prepare('EXPLAIN QUERY PLAN ' + indexedSQL).all('neural') },
    taskSpeedup: null, inferenceLatencyMs: null, providerTokensSaved: null, billingSavings: null,
    limitations: ['A/B somente da consulta SQL com resultado idêntico, não entre versões completas do produto.',
      'Quantis empíricos de 1000 observações não são SLO nem garantia hard real-time.',
      'WAL e synchronous=FULL não simulam falha elétrica nem certificam o filesystem do runner.',
      'A reserva de bytes é declarada; não é medição de RSS, RAM unificada ou VRAM.']
  };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, raw: { storedIn: 'report.json' } }, null, 2));
} finally { read?.close(); db.close(); fs.rmSync(home, { recursive: true, force: true }); }
