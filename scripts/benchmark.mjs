import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { BrainStore } from '../src/store.mjs';
import { indexProject } from '../src/retrieval.mjs';
import { compileContext, tokenCount } from '../src/context.mjs';

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-benchmark-'));
const root=path.join(directory,'corpus');fs.mkdirSync(root);
let store;
const measure=fn=>{const begin=performance.now(),result=fn();return {milliseconds:performance.now()-begin,result};};
try {
  const documents=[];
  for(let index=0;index<60;index++){
    const marker='VERIFY_MODULE_'+String(index).padStart(3,'0');
    const body=['# Module '+index,'Exact contract: '+marker,...Array.from({length:25},(_,line)=>'Requirement '+line+': Preserve the public input and output contract for '+marker+'.')].join('\n');
    fs.writeFileSync(path.join(root,'module-'+String(index).padStart(3,'0')+'.md'),body);documents.push(body);
  }
  store=new BrainStore(path.join(directory,'state'));store.register('benchmark',root);
  const initial=measure(()=>indexProject(store,'benchmark'));
  const repeated=measure(()=>indexProject(store,'benchmark'));
  assert.equal(repeated.result.changed,0);assert.equal(repeated.result.reused,60);
  fs.appendFileSync(path.join(root,'module-000.md'),'\nA new, explicit requirement.');
  const incremental=measure(()=>indexProject(store,'benchmark'));assert.equal(incremental.result.changed,1);
  const queries=[];
  for(let index=0;index<10;index++){
    const marker='VERIFY_MODULE_'+String(index).padStart(3,'0');
    const sample=measure(()=>compileContext(store,{project:'benchmark',query:marker,budget:1500}));
    assert.ok(sample.result.text.includes(marker));assert.ok(sample.result.payloadTokens<=1500);
    queries.push({query:marker,milliseconds:sample.milliseconds,payloadTokens:sample.result.payloadTokens,sources:sample.result.sources.length,expectedMarkerFound:true});
  }
  const sorted=queries.map(x=>x.milliseconds).sort((a,b)=>a-b);
  const corpusTokens=tokenCount(documents.join('\n\n'));
  const report={
    schemaVersion:1,kind:'synthetic-local-retrieval-only',testedRevision:process.env.GITHUB_SHA||null,
    observedAt:new Date().toISOString(),platform:process.platform,architecture:process.arch,node:process.versions.node,
    corpus:{files:60,tokens:corpusTokens,encoding:'o200k_base',generated:true},
    indexing:{initialMs:initial.milliseconds,unchangedMs:repeated.milliseconds,unchangedFilesReused:repeated.result.reused,singleChangeMs:incremental.milliseconds,singleChangeFilesReindexed:incremental.result.changed},
    retrieval:{samples:queries.length,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],meanPayloadTokens:queries.reduce((sum,x)=>sum+x.payloadTokens,0)/queries.length,expectedMarkersFound:queries.filter(x=>x.expectedMarkerFound).length},
    queries,providerCalls:0,providerBillingSavings:null,harnessTaskSuccess:null,
    caveats:['Synthetic corpus, no model inference.','Payload reduction is not provider billing reduction.','Small exploratory sample; no significance claim.','The full corpus is not a realistic optimal baseline for an agent.']
  };
  fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
} finally {store?.close();fs.rmSync(directory,{recursive:true,force:true});}
