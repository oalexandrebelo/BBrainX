import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { evaluateEvidence } from '../src/evidence-contract.mjs';

const out='artifacts/four-rounds';fs.mkdirSync(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',['--no-optional-locks','-c','core.fsmonitor=false',...args],{encoding:'utf8',timeout:10000,maxBuffer:16*1024*1024});
const revision=git('rev-parse','HEAD').trim(),tree=git('rev-parse','HEAD^{tree}').trim();
if(git('status','--porcelain','--untracked-files=no').trim())throw new Error('CLEAN_CHECKOUT_REQUIRED');
const paths=git('ls-files','-z').split('\0').filter(Boolean).sort();
function snapshot(){
  const manifest=[];
  for(const file of paths){
    const s=fs.lstatSync(file);if(!s.isFile()&&!s.isSymbolicLink())throw new Error('UNSUPPORTED_TRACKED_ENTRY');
    const bytes=s.isSymbolicLink()?Buffer.from(fs.readlinkSync(file)):fs.readFileSync(file);
    manifest.push([file,s.isSymbolicLink()?'link':'file',bytes.length,hash(bytes)]);
  }
  return hash(JSON.stringify(manifest));
}
const sourceBefore=snapshot(),files=fs.readdirSync('test').filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'test/'+f);
const args=['--test','--test-reporter=tap',...files],commandDigest=hash(JSON.stringify(['node',...args]));
const began=performance.now();
const run=spawnSync(process.execPath,args,{encoding:'utf8',timeout:300000,maxBuffer:32*1024*1024});
const durationMs=performance.now()-began,log=(run.stdout??'')+(run.stderr??'');
fs.writeFileSync(path.join(out,'tests.log'),log);
const metric=k=>{const found=[...log.matchAll(new RegExp('^# '+k+' (\\d+)$','gm'))];return found.length?Number(found.at(-1)[1]):null;};
const counts=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(k=>[k,metric(k)]));
const identity={repository:process.env.GITHUB_REPOSITORY??'oalexandrebelo/BBrainX',revision,tree,
  lockDigest:hash(fs.readFileSync('package-lock.json')),suite:'all-runtime-tests-v1',commandDigest,
  platform:process.platform,architecture:process.arch,runtime:process.version};
const receipt={schemaVersion:1,identity,run:{id:process.env.GITHUB_RUN_ID??null,attempt:Number(process.env.GITHUB_RUN_ATTEMPT??1),
  durationMs,sourceBefore,sourceAfter:snapshot()},outcome:{completed:!run.error,exitCode:run.status,signal:run.signal},counts,
  artifacts:[{name:'tests.log',sha256:hash(Buffer.from(log)),bytes:Buffer.byteLength(log)}]};
const expected={...identity,minimumTests:342};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
fs.writeFileSync(path.join(out,'expected.json'),JSON.stringify(expected,null,2)+'\n');
let verdict;
try{verdict=evaluateEvidence(receipt,expected);}catch(e){verdict={accepted:false,error:e.code??'EVIDENCE_FAILED'};}
const report={revision,observedAt:new Date().toISOString(),verdict,counts,environment:{node:process.version,platform:process.platform,
  architecture:process.arch,totalMemoryBytes:os.totalmem(),logicalCpus:os.cpus().length},testFiles:files,
  limitations:['Recibo é observação local do runner, não assinatura nem atestado independente.','Próprio corpus e processos de teste; sem inferência de modelos, faturas ou tarefa de usuário.','Snapshot antes/depois não congela filesystem durante execução.','Contagens não somam rodadas anteriores nem plataformas repetidas.']};
fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(!verdict.accepted)process.exitCode=1;
