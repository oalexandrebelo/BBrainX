import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BrainStore} from '../src/store.mjs';
import {indexProject,search} from '../src/retrieval.mjs';
import {compileContext,tokenCount} from '../src/context.mjs';

const out='/private/tmp/bbrainx-audit-20261006/evidence';
const script=fileURLToPath(import.meta.url);
if(process.argv[2]==='--child'){
  const [mode,home,marker,key]=process.argv.slice(3);
  const s=new BrainStore(home);
  process.send({ready:true});
  process.once('message',()=>{
    if(mode==='crash')s.transaction(()=>{
      s.event('probe','audit.uncommitted',{marker:'uncommitted'});
      fs.writeFileSync(marker,'transaction-open');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
    });
    else{
      try{const result=s.checkpoint('probe','concurrent',{objective:'same objective',nextAction:'verify result',status:'review_needed'},0,key);process.send({result});}
      catch(e){process.send({error:e.code||e.message});}
      s.close();process.disconnect();
    }
  });
}else{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-real-audit-'));
 const report={schemaVersion:1,testedRevision:'a9636e9402e3fa673ae05b3489202da1048aef5e',observedAt:new Date().toISOString(),platform:process.platform,architecture:process.arch,node:process.versions.node,kind:'actual-runtime-generated-workload',measurements:[],reproductions:{},providerCalls:0,providerBillingSavings:null,nativeHarnessApplicationsTested:false,limits:['Artificial corpus: this is not accepted coding-task success.','Sequential size trials: page/BPE caches are warm and order is not randomized.','SIGKILL tests process crash, not hardware power loss.','No changes to audited product source.']};
 const clock=fn=>{const t=performance.now();const result=fn();return {ms:performance.now()-t,result};};
 const stats=a=>{const s=[...a].sort((x,y)=>x-y);return {samples:s.length,p50Ms:s[Math.ceil(s.length*.50)-1],p95Ms:s[Math.ceil(s.length*.95)-1],p99Ms:s[Math.ceil(s.length*.99)-1],maxMs:s.at(-1)};};
 const stores=[];
 function fixture(name){const root=path.join(dir,name,'root'),home=path.join(dir,name,'home');fs.mkdirSync(root,{recursive:true});const store=new BrainStore(home);stores.push(store);store.register('probe',root);return {root,home,store};}
 function child(mode,home,marker='',key='k'){
  const p=fork(script,['--child',mode,home,marker,key],{stdio:['ignore','ignore','pipe','ipc']});let stderr='';p.stderr.on('data',x=>stderr+=x);
  const ready=new Promise((resolve,reject)=>{p.on('message',m=>{if(m.ready)resolve();});p.once('error',reject);});
  const result=new Promise((resolve,reject)=>{p.on('message',m=>{if(m.result||m.error)resolve(m);});p.once('error',reject);});
  const exit=new Promise(resolve=>p.once('exit',(code,signal)=>resolve({code,signal,stderr})));
  const timer=setTimeout(()=>p.kill('SIGKILL'),10000);p.once('exit',()=>clearTimeout(timer));return {p,ready,result,exit};
 }
 try{
  for(const count of [60,1000,5000]){
   const f=fixture('scale-'+count);let bytes=0;
   for(let i=0;i<count;i++){const body=`export function verifyModule${i}(session) {\n  const marker = 'AUDIT_MODULE_${String(i).padStart(5,'0')}';\n  return session.authorized && marker;\n}\n`;bytes+=Buffer.byteLength(body);fs.writeFileSync(path.join(f.root,'module-'+i+'.js'),body);}
   const initial=clock(()=>indexProject(f.store,'probe')),unchanged=clock(()=>indexProject(f.store,'probe'));
   assert.equal(unchanged.result.changed,0);assert.equal(unchanged.result.reused,count);
   const searchTimes=[],bootstrapTimes=[];let markers=0;
   for(let i=0;i<100;i++){const q='verifyModule'+((i*37)%count);searchTimes.push(clock(()=>search(f.store,'probe',q,10)).ms);const sample=clock(()=>compileContext(f.store,{project:'probe',query:q,budget:1500}));bootstrapTimes.push(sample.ms);if(sample.result.text.includes(q))markers++;assert.ok(sample.result.payloadTokens<=1500);}
   fs.appendFileSync(path.join(f.root,'module-0.js'),'\n// Actual changed file, audit generated corpus.\n');
   const refresh=clock(()=>compileContext(f.store,{project:'probe',query:'verifyModule0',budget:1500}));assert.equal(refresh.result.refreshedFiles.length,1);
   const pragma=f.store.db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get();
   report.measurements.push({files:count,inputBytes:bytes,initialIndexMs:initial.ms,unchangedIndexMs:unchanged.ms,search:stats(searchTimes),bootstrap:stats(bootstrapTimes),markerHits:markers,staleRefreshMs:refresh.ms,memoryBytes:process.memoryUsage(),databaseBytes:fs.statSync(path.join(f.home,'brain.sqlite')).size,walCheckpoint:pragma});
  }
  {
   const f=fixture('symlink');fs.writeFileSync(path.join(f.root,'source.js'),"export const ROOT_ALLOWED_MARKER = 1;\n");indexProject(f.store,'probe');
   const outside=path.join(dir,'outside-project');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'source.js'),"export const OUTSIDE_ROOT_MARKER = 2;\n");
   fs.renameSync(f.root,f.root+'-original');fs.symlinkSync(outside,f.root,'dir');
   const pack=compileContext(f.store,{project:'probe',query:'ROOT_ALLOWED_MARKER source',budget:1500});
   report.reproductions.rootSymlinkSwap={observed:pack.text.includes('OUTSIDE_ROOT_MARKER'),rootStored:f.store.project('probe').root,rootResolved:fs.realpathSync(f.root),selectedFilesVerified:pack.selectedFilesVerified,refreshedFiles:pack.refreshedFiles};
   assert.equal(report.reproductions.rootSymlinkSwap.observed,true);
  }
  {
   const f=fixture('checkpoint');fs.writeFileSync(path.join(f.root,'source.js'),'export const CHECKPOINT_PROBE = 1;\n');indexProject(f.store,'probe');
   const content={objective:'preserve constraints',nextAction:'review constraints before execution',status:'blocked',done:Array.from({length:40},(_,i)=>'Evidence '+i+': '+('verified item of earlier work '.repeat(5))),decisions:['DECISION_NEVER_DEPLOY_WITHOUT_APPROVAL'],blockers:['BLOCKER_SECURITY_REVIEW_REQUIRED']};
   f.store.checkpoint('probe','resume',content,0,'compact');
   const pack=compileContext(f.store,{project:'probe',query:'CHECKPOINT_PROBE',task:'resume',budget:1000});
   report.reproductions.checkpointCompaction={checkpointTrimmed:pack.checkpointTrimmed,decisionPresent:pack.text.includes('DECISION_NEVER_DEPLOY_WITHOUT_APPROVAL'),blockerPresent:pack.text.includes('BLOCKER_SECURITY_REVIEW_REQUIRED'),payloadTokens:pack.payloadTokens,checkpointStillStored:f.store.task('probe','resume').content.decisions[0]===content.decisions[0]};
   assert.equal(pack.checkpointTrimmed,true);assert.equal(report.reproductions.checkpointCompaction.decisionPresent,false);assert.equal(report.reproductions.checkpointCompaction.checkpointStillStored,true);
  }
  for(const sameKey of [false,true]){
   const f=fixture('concurrent-'+sameKey);fs.writeFileSync(path.join(f.root,'source.js'),'export const CONCURRENT_PROBE = 1;\n');indexProject(f.store,'probe');f.store.close();stores.splice(stores.indexOf(f.store),1);
   const a=child('cas',f.home,'','key-a'),b=child('cas',f.home,'',sameKey?'key-a':'key-b');await Promise.all([a.ready,b.ready]);a.p.send('go');b.p.send('go');
   const results=await Promise.all([a.result,b.result]);await Promise.all([a.exit,b.exit]);const s=new BrainStore(f.home);stores.push(s);
   const events=s.db.prepare("SELECT count(*) AS n FROM events WHERE type='checkpoint.created'").get().n;
   report.reproductions[sameKey?'crossProcessIdempotency':'crossProcessCAS']={results:results.map(x=>({version:x.result?.version??null,error:x.error??null})),storedVersion:s.task('probe','concurrent').version,checkpointEvents:events};
   assert.equal(events,1);assert.equal(s.task('probe','concurrent').version,1);assert.equal(results.filter(x=>x.error==='VERSION_CONFLICT').length,sameKey?0:1);
  }
  {
   const f=fixture('crash');fs.writeFileSync(path.join(f.root,'source.js'),'export const CRASH_PROBE = 1;\n');indexProject(f.store,'probe');f.store.close();stores.splice(stores.indexOf(f.store),1);
   const marker=path.join(dir,'transaction-open'),c=child('crash',f.home,marker);await c.ready;c.p.send('go');const deadline=performance.now()+5000;
   while(!fs.existsSync(marker)){assert.ok(performance.now()<deadline,'Crash probe did not enter transaction');await new Promise(r=>setTimeout(r,10));}
   c.p.kill('SIGKILL');const exit=await c.exit;const s=new BrainStore(f.home);stores.push(s);
   const integrity=s.db.prepare('PRAGMA integrity_check').get(),events=s.db.prepare("SELECT count(*) AS n FROM events WHERE type='audit.uncommitted'").get().n;
   report.reproductions.processCrash={exit,integrity,uncommittedEvents:events};assert.equal(events,0);assert.equal(Object.values(integrity)[0],'ok');
  }
  report.tokenizerProbe={tinyExactTokens:tokenCount('Boundary-sensitive exact token counting'),rssBytes:process.memoryUsage().rss};
 }finally{for(const s of stores)s.close();fs.rmSync(dir,{recursive:true,force:true});}
 fs.writeFileSync(path.join(out,'runtime-audit.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
