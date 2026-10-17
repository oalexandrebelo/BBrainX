import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {BrainStore} from '../src/store.mjs';
import {indexProject,requireFreshIndex,search} from '../src/retrieval.mjs';
import {VERSION} from '../src/version.mjs';

// Real files, SQLite and Git traversal. Measures freshness cost, not accepted tasks or model savings.
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-freshness-bench-')),results=[];
const sample=fn=>{const at=performance.now();fn();return performance.now()-at;};
const summarize=values=>{const a=[...values].sort((a,b)=>a-b);return {n:a.length,p50Ms:a[Math.floor(a.length*.5)],p95Ms:a[Math.min(a.length-1,Math.floor(a.length*.95))],samplesMs:values};};
try{
  for(const files of [60,500,2000]){
    const root=path.join(temp,'corpus-'+files);fs.mkdirSync(root);execFileSync('git',['init','-q',root]);
    let bytes=0;const manifest=[];
    for(let i=0;i<files;i++){
      const name='module-'+String(i).padStart(5,'0')+'.ts';
      const body=`export const marker${i} = ${i};\n`+'// bounded fixture line for freshness measurement\n'.repeat(80);
      fs.writeFileSync(path.join(root,name),body);bytes+=Buffer.byteLength(body);manifest.push([name,digest(body)]);
    }
    const store=new BrainStore(path.join(temp,'state-'+files));
    try{
      store.register('bench',root);const indexed=indexProject(store,'bench');
      const baseline=()=>assert.equal(search(store,'bench','marker42',1).items[0].path,'module-00042.ts');
      const verified=()=>{assert.equal(requireFreshIndex(store,'bench').snapshot,indexed.snapshot);baseline();};
      baseline();verified();const raw=[],fresh=[];
      for(let i=0;i<12;i++){if(i%2){fresh.push(sample(verified));raw.push(sample(baseline));}else{raw.push(sample(baseline));fresh.push(sample(verified));}}
      results.push({files,bytes,manifestSha256:digest(JSON.stringify(manifest)),indexedSnapshot:indexed.snapshot,rawLexical:summarize(raw),verifiedLexical:summarize(fresh)});
    }finally{store.close();}
  }
  const report={schemaVersion:1,kind:'freshness-cost-not-product-speedup',version:VERSION,
    revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),
    sourceSha256:digest(fs.readFileSync(new URL('../src/retrieval.mjs',import.meta.url))),
    observedAt:new Date().toISOString(),host:{platform:process.platform,arch:process.arch,node:process.versions.node,cpu:os.cpus()[0]?.model??null},
    method:{pairs:12,order:'alternating',warmupPairs:1,storage:'temporary-local',synthetic:true},results,
    caveats:['Warm filesystem caches; no cold-start claim.','Synchronous scan cost includes content hashing and Git traversal.','No provider calls, battery measurements or maintainer-device certification.','No atomic filesystem snapshot; edits can race with a scan.']};
  fs.mkdirSync('artifacts/engineering',{recursive:true});fs.writeFileSync('artifacts/engineering/index-freshness.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({report:'artifacts/engineering/index-freshness.json',host:report.host,results:results.map(x=>({files:x.files,bytes:x.bytes,rawP50:x.rawLexical.p50Ms,verifiedP50:x.verifiedLexical.p50Ms,verifiedP95:x.verifiedLexical.p95Ms}))},null,2));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
