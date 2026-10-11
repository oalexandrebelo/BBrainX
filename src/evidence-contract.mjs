import { createHash } from 'node:crypto';

export class EvidenceContractError extends Error {
  constructor(code) { super(code); this.name = 'EvidenceContractError'; this.code = code; }
}
const need = (ok, code) => { if (!ok) throw new EvidenceContractError(code); };
const integer = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
const hex = (s, length) => typeof s === 'string' && new RegExp('^[0-9a-f]{'+length+'}$').test(s);
const name = s => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(s);
function record(value, fields) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_EVIDENCE_RECORD');
  need(Object.keys(value).length === fields.length && fields.every(k => Object.hasOwn(value,k)), 'INVALID_EVIDENCE_FIELDS');
}
const identityFields=['repository','revision','tree','lockDigest','suite','commandDigest','platform','architecture','runtime'];
function identity(value) {
  record(value,identityFields);
  need(typeof value.repository==='string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository) && value.repository.length<=160,'INVALID_EVIDENCE_IDENTITY');
  need(hex(value.revision,40)&&hex(value.tree,40)&&hex(value.lockDigest,64)&&hex(value.commandDigest,64)&&name(value.suite),'INVALID_EVIDENCE_IDENTITY');
  need(['linux','darwin','win32'].includes(value.platform)&&['x64','arm64'].includes(value.architecture)&&name(value.runtime),'INVALID_EVIDENCE_ENVIRONMENT');
}
/** Recebe dados JSON do host. Valida um recibo e sua identidade; NÃO autentica o produtor.
 * O verificador/expected não deve ser controlado pelo mesmo agente que pede a promoção.
 */
export function evaluateEvidence(receipt, expected) {
  record(expected,[...identityFields,'minimumTests']); identity(Object.fromEntries(identityFields.map(k=>[k,expected[k]])));
  need(integer(expected.minimumTests,1),'INVALID_EVIDENCE_MINIMUM');
  record(receipt,['schemaVersion','identity','run','outcome','counts','artifacts']);
  need(receipt.schemaVersion===1,'UNSUPPORTED_EVIDENCE_VERSION'); identity(receipt.identity);
  for(const k of identityFields)need(receipt.identity[k]===expected[k],'EVIDENCE_IDENTITY_MISMATCH');
  record(receipt.run,['id','attempt','durationMs','sourceBefore','sourceAfter']);
  need((receipt.run.id===null || typeof receipt.run.id==='string' && /^[0-9]{1,32}$/.test(receipt.run.id))&&integer(receipt.run.attempt,1),'INVALID_EVIDENCE_RUN');
  need(typeof receipt.run.durationMs==='number'&&Number.isFinite(receipt.run.durationMs)&&receipt.run.durationMs>=0,'INVALID_EVIDENCE_DURATION');
  need(hex(receipt.run.sourceBefore,64)&&hex(receipt.run.sourceAfter,64),'INVALID_EVIDENCE_SOURCE');
  need(receipt.run.sourceBefore===receipt.run.sourceAfter,'EVIDENCE_SOURCE_CHANGED');
  record(receipt.outcome,['completed','exitCode','signal']);
  need(receipt.outcome.completed===true&&receipt.outcome.exitCode===0&&receipt.outcome.signal===null,'EVIDENCE_INCOMPLETE_OR_FAILED');
  const fields=['tests','pass','fail','cancelled','skipped','todo'];record(receipt.counts,fields);
  need(fields.every(k=>integer(receipt.counts[k])),'INVALID_EVIDENCE_COUNTS');
  need(receipt.counts.tests>=expected.minimumTests&&receipt.counts.pass===receipt.counts.tests&&
    ['fail','cancelled','skipped','todo'].every(k=>receipt.counts[k]===0),'EVIDENCE_TESTS_NOT_PASSED');
  need(Array.isArray(receipt.artifacts)&&receipt.artifacts.length>0&&receipt.artifacts.length<=64,'INVALID_EVIDENCE_ARTIFACTS');
  const seen=new Set();
  for(const artifact of receipt.artifacts){
    record(artifact,['name','sha256','bytes']);
    need(name(artifact.name)&&hex(artifact.sha256,64)&&integer(artifact.bytes,1),'INVALID_EVIDENCE_ARTIFACT');
    need(!seen.has(artifact.name),'DUPLICATE_EVIDENCE_ARTIFACT');seen.add(artifact.name);
  }
  // Ordem canônica apenas do recibo, nunca de alternativas/opções enviadas a modelos.
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
    Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
  const receiptId=createHash('sha256').update(JSON.stringify(canonical(receipt))).digest('hex');
  return {receiptId,accepted:true,tests:receipt.counts.tests,scope:'contract-and-expected-identity',
    producerAuthenticated:false,artifactBytesVerified:false,taskCorrectnessCertified:false};
}
