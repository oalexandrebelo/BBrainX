import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

/** Verificação observacional do checkout. Sem rede, instalação, pesos ou conteúdo de projetos privados. */
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.argv[2] ?? path.join(root, 'artifacts/shared-admission/verification'));
fs.mkdirSync(output, { recursive: true });
const hash = data => createHash('sha256').update(data).digest('hex');
const git = (...args) => execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args], {
  cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 16 * 1024 * 1024
});
function sourceSnapshot() {
  const files = git('ls-files', '-z').split('\0').filter(Boolean).sort();
  return hash(JSON.stringify(files.map(file => {
    const target = path.join(root, file), stat = fs.lstatSync(target);
    if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error('UNSUPPORTED_SOURCE_ENTRY');
    const bytes = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(target)) : fs.readFileSync(target);
    return [file, stat.isSymbolicLink() ? 'symlink' : 'file', stat.mode & 0o111, bytes.length, hash(bytes)];
  })));
}
const revision = git('rev-parse', 'HEAD').trim(), tree = git('rev-parse', 'HEAD^{tree}').trim();
const dirtyBefore = git('status', '--porcelain', '--untracked-files=no').trim();
if (dirtyBefore) throw new Error('CLEAN_TRACKED_SOURCE_REQUIRED');
const before = sourceSnapshot();
const files = fs.readdirSync(path.join(root, 'test')).filter(f => f.endsWith('.test.mjs')).sort().map(f => 'test/' + f);
const args = ['--test', '--test-reporter=tap', ...files];
const began = performance.now();
const tests = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 300000, maxBuffer: 32 * 1024 * 1024 });
const testMs = performance.now() - began;
const testLog = (tests.stdout ?? '') + (tests.stderr ?? '');
fs.writeFileSync(path.join(output, 'runtime.log'), testLog);
const metrics = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
const counts = Object.fromEntries(metrics.map(metric => {
  const matches = [...testLog.matchAll(new RegExp('^# ' + metric + ' (\\d+)$', 'gm'))];
  return [metric, matches.length ? Number(matches.at(-1)[1]) : null];
}));
const passed = !tests.error && tests.status === 0 && tests.signal === null && counts.tests >= 393 &&
  counts.pass === counts.tests && metrics.slice(2).every(key => counts[key] === 0);
const buildStart = performance.now();
const build = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024
});
const buildLog = (build.stdout ?? '') + (build.stderr ?? '');
fs.writeFileSync(path.join(output, 'build.log'), buildLog);
const after = sourceSnapshot();
const dirtyAfter = git('status', '--porcelain', '--untracked-files=no').trim();
const artifacts = ['runtime.log', 'build.log'].map(name => {
  const bytes = fs.readFileSync(path.join(output, name)); return { name, bytes: bytes.length, sha256: hash(bytes) };
});
const report = {
  schemaVersion: 1, scope: 'shared-admission-plus-complete-existing-runtime', observedAt: new Date().toISOString(),
  baseline: { remoteRevision: 'b8d2c4730b797828244e914675890990eb1f2558', tree: 'e483c824bd2fc2f980b9a9a1a5a3137c5d1bed63', tests: 342 },
  candidate: { revision, tree, sourceBefore: before, sourceAfter: after, unchanged: before === after && !dirtyAfter },
  environment: { node: process.version, sqlite: process.versions.sqlite ?? null, platform: process.platform,
    architecture: process.arch, release: os.release(), logicalCpus: os.cpus().length, memoryBytes: os.totalmem() },
  commands: { test: ['node', ...args], commandSha256: hash(JSON.stringify(['node', ...args])),
    lockSha256: hash(fs.readFileSync(path.join(root, 'package-lock.json'))) },
  tests: { counts, passed, exitCode: tests.status, signal: tests.signal, durationMs: testMs },
  build: { passed: !build.error && build.status === 0 && build.signal === null, exitCode: build.status,
    signal: build.signal, durationMs: performance.now() - buildStart, warningsRetainedInLog: true },
  artifacts, providerBillingSavings: null, modelInferenceLatencyMs: null, taskAccuracy: null,
  nativeMediumForegroundValidated: false, producerAuthenticated: false,
  limits: ['Tests exercise real SQLite, pipes and owned child processes, not neural model accuracy.',
    'Before/after hashes identify observations; they do not freeze the filesystem during the run.',
    'A local receipt is not a signed attestation or a hosted-CI result.',
    'Test duration is not product throughput; configured bytes are not a hard RSS or VRAM cap.']
};
report.accepted = report.tests.passed && report.build.passed && report.candidate.unchanged;
fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ accepted: report.accepted, revision, tree, counts, build: report.build.passed, sourceUnchanged: report.candidate.unchanged }));
if (!report.accepted) process.exitCode = 1;
