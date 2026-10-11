import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.resolve(process.argv[2]??'artifacts/mcp-transport/baseline-probe');fs.mkdirSync(out,{recursive:true});
const base='b8d2c4730b797828244e914675890990eb1f2558',hash=b=>createHash('sha256').update(b).digest('hex');
const original=execFileSync('git',['show',base+':src/mcp.mjs'],{cwd:root,encoding:'utf8',timeout:10000});
const before=fs.readFileSync(path.join(root,'src/mcp.mjs')),results=[];
for(const variant of ['baseline','candidate']){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-mcp-probe-'));
 try{
  fs.cpSync(path.join(root,'src'),path.join(dir,'src'),{recursive:true});fs.mkdirSync(path.join(dir,'test/artifacts'),{recursive:true});fs.mkdirSync(path.join(dir,'test/fixtures'),{recursive:true});
  for(const f of ['artifacts/mcp-before-after.mjs','fixtures/contract-engine.mjs'])fs.copyFileSync(path.join(root,'test',f),path.join(dir,'test',f));
  if(variant==='baseline')fs.writeFileSync(path.join(dir,'src/mcp.mjs'),original);
  const run=spawnSync(process.execPath,['--test','--test-reporter=tap','test/artifacts/mcp-before-after.mjs'],{cwd:dir,encoding:'utf8',timeout:10000,maxBuffer:2*1024*1024});
  const log=(run.stdout??'')+(run.stderr??'');fs.writeFileSync(path.join(out,variant+'.log'),log);
  const metric=k=>Number([...log.matchAll(new RegExp('^# '+k+' (\\d+)$','gm'))].at(-1)?.[1]);
  const assertions=(log.match(/code: 'ERR_ASSERTION'/g)??[]).length;
  results.push({variant,exitCode:run.status,tests:metric('tests'),pass:metric('pass'),fail:metric('fail'),assertions,
   validObservation:!run.error&&metric('tests')===2&&(variant==='baseline'?run.status!==0&&metric('fail')===2&&assertions===2:run.status===0&&metric('pass')===2),
   mcpSourceSha256:hash(fs.readFileSync(path.join(dir,'src/mcp.mjs')))});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
assert.equal(hash(before),hash(fs.readFileSync(path.join(root,'src/mcp.mjs'))));
const report={schemaVersion:1,base,observedAt:new Date().toISOString(),node:process.version,results,scope:'two-contract-regressions-not-throughput-or-model-quality'};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
if(!results.every(x=>x.validObservation))process.exitCode=1;
