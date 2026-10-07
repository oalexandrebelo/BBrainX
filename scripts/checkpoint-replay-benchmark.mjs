import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { canonical, hash } from '../src/primitives.mjs';

// Usage: node scripts/checkpoint-replay-benchmark.mjs [baseline-ref] [pairs-per-round] [rounds]
// Both implementations run in this process, against the same Git fixture and SQLite database.
const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [baselineRef='38904c38',pairArgument='100',roundArgument='5']=process.argv.slice(2);
const pairs=Number(pairArgument),rounds=Number(roundArgument);
assert.ok(Number.isSafeInteger(pairs)&&pairs>=20&&pairs<=10000);
assert.ok(Number.isSafeInteger(rounds)&&rounds>=3&&rounds<=100);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-checkpoint-benchmark-'));
const baselineRoot=path.join(directory,'baseline'),root=path.join(directory,'fixture');
fs.mkdirSync(baselineRoot);fs.mkdirSync(root);
const git=(args,options={})=>childProcess.execFileSync('git',['--no-replace-objects',...args],{encoding:'utf8',...options});
const baselineCommit=git(['-C',repository,'rev-parse','--verify','--end-of-options',`${baselineRef}^{commit}`]).trim();
childProcess.execFileSync('tar',['-xf','-','-C',baselineRoot],{input:git(['-C',repository,'archive',baselineCommit,'src'],{encoding:'buffer'}),maxBuffer:16*1024*1024});
fs.writeFileSync(path.join(root,'entry.mjs'),'export const checkpointFixture = 1;\n');
git(['init','-q',root]);git(['-C',root,'add','.']);
git(['-C',root,'-c','user.name=Benchmark','-c','user.email=benchmark@example.invalid','-c','core.hooksPath=/dev/null','commit','-qm','fixture']);
const originals={spawnSync:childProcess.spawnSync,prepare:DatabaseSync.prototype.prepare,exec:DatabaseSync.prototype.exec};
let observation=null,stores=[];
childProcess.spawnSync=function(...args){if(observation&&args[0]==='git'){observation.gitCalls++;}return originals.spawnSync.apply(this,args);};
DatabaseSync.prototype.prepare=function(sql){
  const statement=originals.prepare.call(this,sql);
  return new Proxy(statement,{get(target,key){
    const value=Reflect.get(target,key,target);
    if(typeof value!=='function')return value;
    return (...args)=>{
      if(observation&&['get','all','run','iterate'].includes(key)){
        observation.sqlStatements++;
        if(/^\s*SELECT\b/i.test(sql))observation.sqlReads++;
        if(/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))observation.sqlWrites++;
      }
      return value.apply(target,args);
    };
  }});
};
DatabaseSync.prototype.exec=function(sql){if(observation&&/\bBEGIN IMMEDIATE\b/i.test(sql))observation.writeTransactions++;return originals.exec.call(this,sql);};
syncBuiltinESMExports();

function median(values){const sorted=values.toSorted((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;}
// Fresh writes have unique task IDs and observation/write times; all other response fields must agree.
function freshWriteHash(response){
  const {task,updated,...rest}=response;
  const {stampedAt,...host}=rest.content.host;
  return hash({...rest,content:{...rest.content,host}});
}
function statistics(samples){
  const values=samples.map(sample=>sample.ms),sorted=values.toSorted((a,b)=>a-b),mid=median(values);
  return {n:values.length,medianMs:mid,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],minMs:sorted[0],maxMs:sorted.at(-1),madMs:median(values.map(value=>Math.abs(value-mid))),operations:samples.reduce((total,sample)=>{for(const key of ['gitCalls','sqlStatements','sqlReads','sqlWrites','writeTransactions'])total[key]+=sample[key];return total;},{gitCalls:0,sqlStatements:0,sqlReads:0,sqlWrites:0,writeTransactions:0})};
}
function timed(call){
  observation={gitCalls:0,sqlStatements:0,sqlReads:0,sqlWrites:0,writeTransactions:0};
  const start=performance.now();
  try{const value=call();return {sample:{ms:performance.now()-start,...observation},value};}
  finally{observation=null;}
}
try{
  const baseline=await import(pathToFileURL(path.join(baselineRoot,'src/store.mjs')).href);
  const candidate=await import(pathToFileURL(path.join(repository,'src/store.mjs')).href);
  const baselineSession=await import(pathToFileURL(path.join(baselineRoot,'src/session.mjs')).href);
  const candidateSession=await import(pathToFileURL(path.join(repository,'src/session.mjs')).href);
  const {indexProject}=await import(pathToFileURL(path.join(baselineRoot,'src/retrieval.mjs')).href);
  const home=path.join(directory,'state'),before=new baseline.BrainStore(home),after=new candidate.BrainStore(home);stores=[before,after];
  before.register('fixture',root);const {snapshot}=indexProject(before,'fixture');
  const request={project:'fixture',task:'checkpoint',content:{objective:'Record fixture',nextAction:'Resume fixture',status:'paused'},expectedVersion:0,idempotencyKey:'attempt'};
  const first=baselineSession.saveCheckpoint(before,request),firstCanonical=canonical(first),firstHash=hash(first);
  const declaredRequest={...request,task:'declared',content:{...request.content,snapshot},idempotencyKey:'declared'};
  const declaredFirst=baselineSession.saveCheckpoint(before,declaredRequest);
  const runReplay=(session,store,input)=>()=>session.saveCheckpoint(store,input);
  const runCollision=(session,store)=>()=>{try{session.saveCheckpoint(store,{...request,content:{...request.content,nextAction:'Changed request'}});assert.fail('collision accepted');}catch(error){assert.equal(error.code,'IDEMPOTENCY_CONFLICT');return error.code;}};
  const cases=[
    {name:'replay-omitted-snapshot',count:pairs,calls:[runReplay(baselineSession,before,request),runReplay(candidateSession,after,request)],expectedHash:firstHash},
    {name:'replay-declared-snapshot',count:pairs,calls:[runReplay(baselineSession,before,declaredRequest),runReplay(candidateSession,after,declaredRequest)],expectedHash:hash(declaredFirst)},
    {name:'idempotency-conflict',count:pairs,calls:[runCollision(baselineSession,before),runCollision(candidateSession,after)],expectedHash:hash('IDEMPOTENCY_CONFLICT')},
    {name:'new-checkpoint',count:Math.max(20,Math.floor(pairs/5)),calls:[null,null],expectedHash:null}
  ];
  let serial=0;const results=[];
  for(const scenario of cases){
    const samples=[[],[]],batches=[];
    const call=variant=>scenario.name==='new-checkpoint'?()=>{
      const id=`new-${serial++}`;
      const value=(variant===0?baselineSession:candidateSession).saveCheckpoint(variant===0?before:after,{...request,task:id,content:{...request.content,snapshot},idempotencyKey:id});
      assert.equal(value.version,1);assert.equal(value.content.snapshot,snapshot);return value;
    }:scenario.calls[variant];
    for(let warmup=0;warmup<20;warmup++)for(const variant of warmup%2?[1,0]:[0,1])call(variant)();
    const eventsBefore=before.db.prepare('SELECT count(*) AS n FROM events').get().n;
    for(let round=0;round<rounds;round++){
      const batch=[[],[]];
      for(let pair=0;pair<scenario.count;pair++)for(const variant of (round+pair)%2?[1,0]:[0,1]){
        const {sample,value}=timed(call(variant));
        if(scenario.name==='new-checkpoint'){
          const normalizedHash=freshWriteHash(value);
          scenario.expectedHash??=normalizedHash;assert.equal(normalizedHash,scenario.expectedHash);
        }else assert.equal(hash(value),scenario.expectedHash);
        sample.round=round;sample.pair=pair;sample.order=(round+pair)%2===variant?0:1;
        samples[variant].push(sample);batch[variant].push(sample.ms);
      }
      batches.push({round,baselineMedianMs:median(batch[0]),candidateMedianMs:median(batch[1])});
    }
    const eventsAfter=before.db.prepare('SELECT count(*) AS n FROM events').get().n;
    const baselineStats=statistics(samples[0]),candidateStats=statistics(samples[1]);
    if(scenario.name==='new-checkpoint')assert.equal(eventsAfter-eventsBefore,scenario.count*rounds*2);
    else{
      assert.equal(eventsAfter,eventsBefore);
      assert.equal(candidateStats.operations.gitCalls,0,'candidate replay/conflict must not observe Git');
      assert.equal(candidateStats.operations.writeTransactions,0,'candidate replay/conflict must remain a read');
    }
    results.push({case:scenario.name,baseline:baselineStats,candidate:candidateStats,pairedDeltaMedianMs:median(samples[0].map((sample,index)=>sample.ms-samples[1][index].ms)),medianReductionPercent:100*(baselineStats.medianMs-candidateStats.medianMs)/baselineStats.medianMs,batches,eventsAdded:eventsAfter-eventsBefore,responseHash:scenario.expectedHash,responseHashScope:scenario.name==='new-checkpoint'?'all response fields except task, updated and content.host.stampedAt':'complete response',samples:{baseline:samples[0],candidate:samples[1]}});
  }
  assert.equal(canonical(candidateSession.saveCheckpoint(after,request)),firstCanonical);
  const sourceHashes={benchmarkScript:hash(fs.readFileSync(fileURLToPath(import.meta.url))),baselineStore:hash(fs.readFileSync(path.join(baselineRoot,'src/store.mjs'))),candidateStore:hash(fs.readFileSync(path.join(repository,'src/store.mjs'))),baselineSession:hash(fs.readFileSync(path.join(baselineRoot,'src/session.mjs'))),candidateSession:hash(fs.readFileSync(path.join(repository,'src/session.mjs')))};
  console.log(JSON.stringify({measuredAt:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,sqlite:before.db.prepare('SELECT sqlite_version() AS version').get().version,gitVersion:git(['--version']).trim(),baselineCommit,candidateHead:git(['-C',repository,'rev-parse','HEAD']).trim(),candidateDirty:Boolean(git(['-C',repository,'status','--porcelain=v1','--untracked-files=all'])),sourceHashes,method:{rounds,pairsPerRound:pairs,warmupPerVariantPerCase:20,alternatingOrder:true,sameProcess:true,sameFixture:true,sameDatabase:true,timer:'performance.now()',instrumentation:'real spawnSync and DatabaseSync execution observed, not replaced',hashOutsideTimedInterval:true,latencyUnit:'ms'},payload:{canonicalBytes:Buffer.byteLength(firstCanonical),sha256:firstHash,allReplayHashesEqual:true},results},null,2));
}finally{
  for(const store of stores)store.close();
  childProcess.spawnSync=originals.spawnSync;DatabaseSync.prototype.prepare=originals.prepare;DatabaseSync.prototype.exec=originals.exec;syncBuiltinESMExports();
  fs.rmSync(directory,{recursive:true,force:true});
}
