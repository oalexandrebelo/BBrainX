/** Políticas BBrainX. Orçamento de admissão não é limite RSS imposto pelo sistema operacional. */
export const GiB = 1024 ** 3, MiB = 1024 ** 2;
export const PROFILE_VERSION = 'workstation-v1';
export const CORE_REFERENCE = 'MEDIUM';
const row = (id, minGiB, minCpu, runtimeMiB, reserveGiB, lanes, packTokens, cacheMiB, diskGiB) =>
  Object.freeze({ id, minMemoryBytes: minGiB * GiB, minCpu, runtimeBudgetBytes: runtimeMiB * MiB,
    hostReserveBytes: reserveGiB * GiB, maxConcurrent: lanes, packTokens,
    decisionCacheBytes: cacheMiB * MiB, suggestedFreeDiskBytes: diskGiB * GiB,
    backgroundConcurrent: 1, modelConcurrent: id === 'LOW' ? 0 : 1,
    maxFrameBytes: MiB, maxReplayBytes: 8 * MiB,
    reference: id === CORE_REFERENCE, autoTrain: false, autoCloudFallback: false });
export const INFRASTRUCTURE = Object.freeze([
  row('LOW', 8, 2, 768, 4, 1, 3000, 2, 3),
  row('MEDIUM', 16, 4, 3072, 8, 2, 6000, 8, 10),
  row('HIGH', 32, 8, 6144, 16, 3, 8000, 16, 20),
  row('PRO', 64, 12, 12288, 32, 4, 12000, 32, 40),
  row('MAX', 128, 16, 24576, 64, 6, 16000, 64, 80)
]);
const positive = n => Number.isSafeInteger(n) && n > 0;
const natural = n => Number.isSafeInteger(n) && n >= 0;
const label = x => typeof x === 'string' && x.length > 0 && x.length <= 160 && !/[\x00-\x1f]/.test(x);
export function profileById(id) {
  const result = INFRASTRUCTURE.find(p => p.id === id);
  if (!result) throw new RangeError('UNKNOWN_PROFILE');
  return result;
}
/** Paralelismo disponível não é quantidade de núcleos físicos. Não arredondar RAM para promover perfil. */
export function infrastructurePlan({ totalMemoryBytes, cpuCount, constrainedMemoryBytes = 0 }, requested = 'AUTO') {
  // libuv pode representar um teto nativo muito acima da RAM física por um Number > MAX_SAFE_INTEGER.
  // Não contamos/alocamos nesse domínio: limitamos pela RAM física validada antes de qualquer cálculo.
  const validConstraint = Number.isFinite(constrainedMemoryBytes) && Number.isInteger(constrainedMemoryBytes) && constrainedMemoryBytes >= 0;
  if (!positive(totalMemoryBytes) || !positive(cpuCount) || !validConstraint) throw new RangeError('INVALID_HARDWARE');
  if (requested !== 'AUTO') profileById(requested);
  const effectiveMemoryBytes = constrainedMemoryBytes > 0 ? Math.min(totalMemoryBytes, constrainedMemoryBytes) : totalMemoryBytes;
  const supported = INFRASTRUCTURE.filter(p => p.minMemoryBytes <= effectiveMemoryBytes && p.minCpu <= cpuCount);
  const ceiling = supported.at(-1) ?? null;
  // AUTO preserva a estação: hardware maior não ativa perfil mais dispendioso silenciosamente.
  const selected = requested === 'AUTO' ? supported.filter(p => ['LOW','MEDIUM'].includes(p.id)).at(-1) ?? null : supported.find(p => p.id === requested) ?? null;
  return {
    schemaVersion: 1, policyVersion: PROFILE_VERSION, reference: CORE_REFERENCE, requested,
    hardware: { totalMemoryBytes, effectiveMemoryBytes, cpuCount, constrainedMemoryBytes, constraintAbovePhysical: constrainedMemoryBytes > totalMemoryBytes },
    capabilityCeiling: ceiling?.id ?? null, selected: selected?.id ?? null, limits: selected,
    eligible: selected !== null, reason: selected ? 'PROFILE_SELECTED' : 'BELOW_REQUESTED_PROFILE',
    enforcement: 'cooperative-admission-only', measuredMedium: false,
    automaticModelDownload: false, automaticTraining: false, automaticCloudFallback: false
  };
}
/** Portão de revisão de manifestos, não autenticação de medições nem aprovação de marketing. */
export function mediumEvidenceGate(records, testedRevision) {
  if (!Array.isArray(records) || records.length > 10000 || !/^[a-f0-9]{40}$/.test(testedRevision ?? '')) throw new TypeError('INVALID_EVIDENCE_INPUT');
  const reasons = new Set(), eligible = [], runs = new Set(), digests = new Set();
  for (const r of records) {
    const h = r?.hardware;
    const valid = r?.revision === testedRevision && r?.kind === 'native-task-benchmark' && r?.requestedProfile === CORE_REFERENCE &&
      label(r.runId) && label(r.machineId) && /^[a-f0-9]{64}$/.test(r.rawEvidenceSha256 ?? '') &&
      h && positive(h.totalMemoryBytes) && h.totalMemoryBytes >= 16 * GiB && h.totalMemoryBytes < 32 * GiB &&
      positive(h.cpuCount) && h.cpuCount >= 4 && h.platform === 'darwin' &&
      r.virtualized === false && r.withForegroundWorkload === true &&
      natural(r.acceptedTasks) && positive(r.totalTasks) && r.totalTasks <= 1000000 && r.acceptedTasks <= r.totalTasks &&
      positive(r.durationSeconds) && r.durationSeconds <= 604800 &&
      Number.isFinite(r.foregroundP95Regression) && r.foregroundP95Regression >= -1 && r.foregroundP95Regression <= 0.05;
    if (!valid) { reasons.add('INELIGIBLE_RECORD'); continue; }
    if (runs.has(r.runId) || digests.has(r.rawEvidenceSha256)) { reasons.add('DUPLICATE_EVIDENCE'); continue; }
    runs.add(r.runId); digests.add(r.rawEvidenceSha256); eligible.push(r);
  }
  const machines = new Set(eligible.map(r => r.machineId));
  const tasks = eligible.reduce((sum, r) => sum + r.totalTasks, 0);
  const acceptedTasks = eligible.reduce((sum, r) => sum + r.acceptedTasks, 0);
  const duration = eligible.reduce((sum, r) => sum + r.durationSeconds, 0);
  if (machines.size < 2) reasons.add('TWO_NATIVE_MEDIUM_MACS_REQUIRED');
  if (tasks < 100) reasons.add('ONE_HUNDRED_RECORDED_TASKS_REQUIRED');
  if (duration < 7200) reasons.add('TWO_HOURS_AGGREGATE_REQUIRED');
  return { eligibleForReview: reasons.size === 0, reasons: [...reasons], machines: machines.size, tasks, acceptedTasks, durationSeconds: duration,
    claimAllowed: false, requiresHumanEvidenceReview: true,
    caveat: 'Este gate não autentica registros, não mede 99% de acerto e não prova predominância de testes MEDIUM no portfólio.' };
}
