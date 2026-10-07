import fs from 'node:fs';
import os from 'node:os';
import { constants } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { infrastructurePlan, mediumEvidenceGate, CORE_REFERENCE } from '../src/infrastructure.mjs';
import { replayWorld, REPLAY_LIMITS } from '../src/replay.mjs';
import { ResourceAdmission } from '../src/resource-admission.mjs';

/** Lê no máximo max+1 bytes de um arquivo regular; não aceita symlink como entrada de replay. */
export function readBoundedJson(filename, max = REPLAY_LIMITS.bytes) {
  const before = fs.lstatSync(filename);
  if (!before.isFile() || before.isSymbolicLink() || before.size > max) throw new Error('INVALID_INPUT_FILE');
  const fd = fs.openSync(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const after = fs.fstatSync(fd);
    if (!after.isFile() || after.size > max || before.dev !== after.dev || before.ino !== after.ino) throw new Error('INPUT_FILE_CHANGED');
    const buffer = Buffer.alloc(max + 1); let bytes = 0;
    while (bytes <= max) { const n = fs.readSync(fd, buffer, bytes, max + 1 - bytes, null); if (!n) break; bytes += n; }
    if (bytes > max) throw new Error('INPUT_TOO_LARGE');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytes)));
  } finally { fs.closeSync(fd); }
}
const flags = new Set(['--profile','--file','--strategy','--steps','--cost','--revision']);
export async function workstationMain(argv) {
  const [command = 'help', ...rest] = argv;
  if (command === 'help' || command === '--help') return { usage: [
    'node scripts/workstation.mjs profiles [--profile AUTO|LOW|MEDIUM|HIGH|PRO|MAX]',
    'node scripts/workstation.mjs replay --file history.cases [--strategy round-robin|depth-first|best-observed] [--steps 1000] [--cost 1000000]',
    'node scripts/workstation.mjs evidence --file manifest.json --revision <commit40>'
  ], coreReference: CORE_REFERENCE, limits: 'Sem instalação, rede, treino, mutação de política ou alegação de benchmark MEDIUM.' };
  if (!['profiles','replay','evidence'].includes(command)) throw new Error('UNKNOWN_COMMAND');
  const args = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!flags.has(rest[i]) || Object.hasOwn(args, rest[i]) || rest[i + 1] === undefined || rest[i + 1].startsWith('--')) throw new Error('INVALID_ARGUMENTS');
    args[rest[i]] = rest[i + 1];
  }
  const allowed = {profiles:['--profile'],replay:['--file','--strategy','--steps','--cost'],evidence:['--file','--revision']}[command];
  if (Object.keys(args).some(k => !allowed.includes(k))) throw new Error('UNUSED_ARGUMENT');
  if (command === 'evidence') { if (!args['--file'] || !args['--revision']) throw new Error('EVIDENCE_ARGUMENTS_REQUIRED'); return mediumEvidenceGate(readBoundedJson(args['--file']), args['--revision']); }
  const plan = infrastructurePlan({ totalMemoryBytes: os.totalmem(), cpuCount: os.availableParallelism(), constrainedMemoryBytes: process.constrainedMemory?.() ?? 0 }, args['--profile'] ?? 'AUTO');
  if (command === 'profiles') return plan;
  if (!args['--file']) throw new Error('WORLD_FILE_REQUIRED');
  if (!plan.eligible) throw new Error('HOST_BELOW_PROFILE_MINIMUM');
  // Esta única operação usa admissão cooperativa; ela não governa os outros processos BBrainX.
  const admission = new ResourceAdmission({ profile: plan.selected });
  admission.observe({availableBytes: Math.min(os.freemem(), process.availableMemory?.() ?? os.freemem()), observedAtMs: performance.now(), thermal:'unknown', onBattery:null});
  const lease = admission.acquire({bytes:64 * 1024 * 1024, kind:'interactive'});
  if (!lease.ok) throw new Error(lease.reason);
  const controller = new AbortController(), interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  try {
    const result = await replayWorld(readBoundedJson(args['--file']), {
      strategy:args['--strategy'] ?? 'round-robin', maxSteps:args['--steps'] === undefined ? 1000 : Number(args['--steps']),
      maxCost:args['--cost'] === undefined ? 1000000 : Number(args['--cost']), signal:controller.signal
    });
    return { ...result, infrastructure:plan, admissionScope:'this-replay-process', residentMemoryBytes:process.memoryUsage().rss };
  } finally { process.removeListener('SIGINT', interrupt); admission.release(lease.token); }
}
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  workstationMain(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{
    // Não imprime o arquivo recebido, a árvore de busca nem dados de configuração globais.
    console.error(JSON.stringify({ok:false,error:error.code ?? error.message})); process.exitCode=1;
  });
}
