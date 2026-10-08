import {test} from 'node:test';
import assert from 'node:assert/strict';
import {memoryPairEvidence,parseBenchArgs,rankCandidateMethods} from '../scripts/laya-bench.mjs';

test('Laya benchmark flags have bounded defaults and require an evaluation input',()=>{
  assert.deepEqual(parseBenchArgs(['--project','demo','--cases','cases.cases']),{
    project:'demo',cases:'cases.cases',memory:undefined,candidates:10,maxLen:1024,batchSize:4,timeoutMs:120000,out:undefined
  });
  assert.throws(()=>parseBenchArgs([]),{code:'LAYA_BENCH_INPUT_REQUIRED'});
  assert.throws(()=>parseBenchArgs(['--cases','cases.cases']),{code:'LAYA_BENCH_PROJECT_REQUIRED'});
});

test('Laya benchmark rejects invalid batch, length, timeout and candidate values',()=>{
  for(const args of [
    ['--memory','pairs.cases','--batch-size','0'],
    ['--memory','pairs.cases','--max-len','0'],
    ['--memory','pairs.cases','--max-len','255'],
    ['--memory','pairs.cases','--max-len','8193'],
    ['--memory','pairs.cases','--timeout-ms','NaN'],
    ['--project','demo','--cases','cases.cases','--candidates','51']
  ])assert.throws(()=>parseBenchArgs(args),{code:'LAYA_BENCH_OPTION_INVALID'});
});

test('rank candidates preserves historical orderings and refuses model reorder on truncation or non-finite scores',()=>{
  const head=[{path:'a.ts'},{path:'b.ts'},{path:'c.ts'}],tail=[{path:'d.ts'}];
  const answers=[
    {noul:{noul:0.1,answer_confidence:0.9},score:{score:0.2}},
    {noul:{noul:0.8,answer_confidence:0.8},score:{score:1.8}},
    {noul:{noul:0.7,answer_confidence:0.7},score:{score:1.1}}
  ];
  const methods=rankCandidateMethods(head,tail,answers,[{truncated:false,stateTokensDropped:0},{truncated:false,stateTokensDropped:0},{truncated:false,stateTokensDropped:0}],['b.ts']);
  assert.deepEqual(methods.ranks,{lexical:2,noul:1,score:1,fusedNoul:1,fusedScore:1,safeFallbackNoul:1,safeFallbackScore:1});
  assert.equal(methods.safeFallbackReason,null);
  const truncated=rankCandidateMethods(head,tail,answers,[{truncated:true,stateTokensDropped:8},{truncated:false,stateTokensDropped:0},{truncated:false,stateTokensDropped:0}],['b.ts']);
  assert.equal(truncated.safeFallbackReason,'truncated');
  assert.equal(truncated.ranks.safeFallbackNoul,truncated.ranks.lexical);
  assert.equal(truncated.ranks.safeFallbackScore,truncated.ranks.lexical);
  const headTruncated=rankCandidateMethods(head,tail,answers,[{truncated:false,headTruncated:true,headWarnings:['yes']},{truncated:false,headTruncated:false},{truncated:false,headTruncated:false}],['b.ts']);
  assert.equal(headTruncated.safeFallbackReason,'head_truncated');
  assert.equal(headTruncated.ranks.safeFallbackNoul,headTruncated.ranks.lexical);
  assert.equal(headTruncated.ranks.safeFallbackScore,headTruncated.ranks.lexical);
  const nonFinite=rankCandidateMethods(head,tail,[answers[0],{...answers[1],noul:{noul:NaN,answer_confidence:0.5}},answers[2]],answers.map(()=>({truncated:false,stateTokensDropped:0})),['b.ts']);
  assert.equal(nonFinite.safeFallbackReason,'non_finite_score');
  assert.equal(nonFinite.ranks.safeFallbackNoul,nonFinite.ranks.lexical);
});

test('memory evidence retains worker latency for the legacy pair percentile',()=>{
  const pair={label:true};
  const row=memoryPairEvidence(pair,0,{answers:{applies:{noul:0.7,answer_confidence:0.8},pick:{choice:'A',answer_confidence:0.8}},truncated:false,headTruncated:false,headWarnings:[],stateTokensDropped:0,e2eMs:4.2,workerMs:2.5});
  assert.equal(pair.workerMs,2.5);
  assert.equal(row.workerMs,2.5);
  assert.equal(row.e2eMs,4.2);
});
