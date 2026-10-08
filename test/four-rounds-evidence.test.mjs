import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateEvidence} from '../src/evidence-contract.mjs';
function example(){
  const identity={repository:'owner/project',revision:'a'.repeat(40),tree:'b'.repeat(40),lockDigest:'c'.repeat(64),
    suite:'node-domain-v1',commandDigest:'d'.repeat(64),platform:'darwin',architecture:'arm64',runtime:'v24.0.0'};
  const receipt={schemaVersion:1,identity,run:{id:null,attempt:1,durationMs:1,sourceBefore:'e'.repeat(64),sourceAfter:'e'.repeat(64)},
    outcome:{completed:true,exitCode:0,signal:null},counts:{tests:2,pass:2,fail:0,cancelled:0,skipped:0,todo:0},
    artifacts:[{name:'tests.log',sha256:'f'.repeat(64),bytes:200}]};
  return {receipt,expected:{...identity,minimumTests:2}};
}
test('receipt gate accepts matching complete observed result without claiming producer authentication',()=>{
  const {receipt,expected}=example(),r=evaluateEvidence(receipt,expected);assert(r.accepted);assert.equal(r.tests,2);
  assert.equal(r.producerAuthenticated,false);assert.equal(r.artifactBytesVerified,false);assert.equal(r.taskCorrectnessCertified,false);
});
for(const key of ['repository','revision','tree','lockDigest','suite','commandDigest','platform','architecture','runtime'])
 test('receipt from different '+key+' cannot certify the expected build',()=>{
  const {receipt,expected}=example();
  const other={repository:'other/project',revision:'f'.repeat(40),tree:'c'.repeat(40),lockDigest:'a'.repeat(64),suite:'other',commandDigest:'b'.repeat(64),platform:'linux',architecture:'x64',runtime:'v24.1.0'};
  receipt.identity[key]=other[key];assert.throws(()=>evaluateEvidence(receipt,expected),{code:'EVIDENCE_IDENTITY_MISMATCH'});
 });
test('zero cases, missing counts and mismatched totals cannot produce a green receipt',()=>{
  for(const patch of [{tests:0,pass:0},{pass:1},{tests:null}]){
    const {receipt,expected}=example();Object.assign(receipt.counts,patch);assert.throws(()=>evaluateEvidence(receipt,expected));
  }
});
test('skipped TODO and cancelled tests are explicit refusal, not implied success',()=>{
  for(const key of ['skipped','todo','cancelled','fail']){
    const {receipt,expected}=example();receipt.counts[key]=1;assert.throws(()=>evaluateEvidence(receipt,expected),{code:'EVIDENCE_TESTS_NOT_PASSED'});
  }
});
test('timeout or signal termination cannot be hidden behind reported passing counts',()=>{
  for(const patch of [{completed:false},{exitCode:null},{signal:'SIGKILL'}]){
    const {receipt,expected}=example();Object.assign(receipt.outcome,patch);assert.throws(()=>evaluateEvidence(receipt,expected),{code:'EVIDENCE_INCOMPLETE_OR_FAILED'});
  }
});
test('tracked source changed during validation invalidates attribution',()=>{
  const {receipt,expected}=example();receipt.run.sourceAfter='f'.repeat(64);assert.throws(()=>evaluateEvidence(receipt,expected),{code:'EVIDENCE_SOURCE_CHANGED'});
});
test('explicit expected minimum catches a smaller or accidentally filtered suite',()=>{
  const {receipt,expected}=example();expected.minimumTests=3;assert.throws(()=>evaluateEvidence(receipt,expected),{code:'EVIDENCE_TESTS_NOT_PASSED'});
});
test('artifacts cannot overwrite each other through duplicate names or paths',()=>{
  const {receipt,expected}=example();receipt.artifacts.push({...receipt.artifacts[0]});assert.throws(()=>evaluateEvidence(receipt,expected),{code:'DUPLICATE_EVIDENCE_ARTIFACT'});
  receipt.artifacts.pop();receipt.artifacts[0].name='../tests.log';assert.throws(()=>evaluateEvidence(receipt,expected),{code:'INVALID_EVIDENCE_ARTIFACT'});
});
test('identity match cannot be bypassed by extra fields or unknown receipt versions',()=>{
  const {receipt,expected}=example();receipt.schemaVersion=2;assert.throws(()=>evaluateEvidence(receipt,expected),{code:'UNSUPPORTED_EVIDENCE_VERSION'});
  receipt.schemaVersion=1;receipt.approvedByModel=true;assert.throws(()=>evaluateEvidence(receipt,expected),{code:'INVALID_EVIDENCE_FIELDS'});
});
test('NaN negative or infinite duration is not a measurement',()=>{
  for(const value of [NaN,Infinity,-1]){
    const {receipt,expected}=example();receipt.run.durationMs=value;assert.throws(()=>evaluateEvidence(receipt,expected),{code:'INVALID_EVIDENCE_DURATION'});
  }
});
test('canonical receipt identity ignores object key ordering but preserves array order',()=>{
  const {receipt,expected}=example();const first=evaluateEvidence(receipt,expected).receiptId;
  const reordered=Object.fromEntries(Object.entries(receipt).reverse());assert.equal(evaluateEvidence(reordered,expected).receiptId,first);
  receipt.artifacts.push({name:'second.log',sha256:'a'.repeat(64),bytes:1});
  const before=evaluateEvidence(receipt,expected).receiptId;receipt.artifacts.reverse();assert.notEqual(evaluateEvidence(receipt,expected).receiptId,before);
});
