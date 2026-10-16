import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { BrainStore } from '../src/store.mjs';
import { hash } from '../src/primitives.mjs';
import { indexProject, search } from '../src/retrieval.mjs';
import { legacyRetrieval, legacySelect, rankCorpus, rankQueries } from '../test/fixtures/fts-rank.mjs';

// Corpus fixo e chamadas reais. Só troca ORDER BY bm25 pela coluna rank com os mesmos pesos.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-rank-bench-')),root=path.join(dir,'repo');let store;
const summarize=samples=>{const sorted=[...samples].sort((a,b)=>a-b);return {medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.floor(sorted.length*.95)],samplesMs:samples};};
const measure=fn=>{const at=performance.now(),result=fn();return {ms:performance.now()-at,result};};
try{
  rankCorpus(root);store=new BrainStore(path.join(dir,'state'));store.register('bench',root);
  const indexed=indexProject(store,'bench'),baseline=await legacyRetrieval(dir),results=[];
  for(const query of rankQueries){
    const before=()=>baseline.search(store,'bench',query,50),after=()=>search(store,'bench',query,50);
    for(let i=0;i<3;i++)assert.deepEqual(after(),before());
    const old=[],candidate=[];
    for(let pair=0;pair<21;pair++){
      let a,b;if(pair%2){b=measure(after);a=measure(before);}else{a=measure(before);b=measure(after);}
      assert.deepEqual(b.result,a.result);old.push(a.ms);candidate.push(b.ms);
    }
    results.push({query,identical:true,baseline:summarize(old),native:summarize(candidate)});
  }
  const report={schemaVersion:1,kind:'fts-rank-microbenchmark-not-task-speedup',observedAt:new Date().toISOString(),
    revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),
    sourceSha256:hash(fs.readFileSync(new URL('../src/retrieval.mjs',import.meta.url))),baselineSql:legacySelect,
    baselineSourceSha256:hash(fs.readFileSync(path.join(dir,'legacy-retrieval.mjs'))),
    host:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model},
    corpus:{generatorSha256:hash(fs.readFileSync(new URL('../test/fixtures/fts-rank.mjs',import.meta.url))),files:indexed.files,bytes:indexed.bytes,chunks:store.stmt('SELECT count(*) AS n FROM chunks').get().n,snapshot:indexed.snapshot},
    method:{warmupPairs:3,pairs:21,order:'alternating',limit:50,weights:[2,1,8,1.5],freshnessScan:false},results,
    caveats:['Warm local filesystem and SQLite caches; no cold-start claim.','Measures search only, excluding freshness, tokenizer, provider calls and accepted tasks.','Baseline differs only in its real prepared FTS SQL; all scoring and inputs are shared.']};
  const output='docs/engineering/evidence/retrieval-review-2026-10-16.cases';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({output,corpus:report.corpus,results:results.map(x=>({query:x.query,beforeMs:x.baseline.medianMs,afterMs:x.native.medianMs,identical:x.identical}))},null,2));
}finally{store?.close();fs.rmSync(dir,{recursive:true,force:true});}
