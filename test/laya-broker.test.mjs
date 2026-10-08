import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {LayaBroker,findPython} from '../src/laya.mjs';
const worker=fileURLToPath(new URL('./fixtures/laya-protocol-worker.mjs',import.meta.url));
const question={kind:{type:'choice',instructions:'Classify this text.',criteria:{bug:'a bug',docs:'documentation'}}};
function broker(t,mode='normal',options={}){const instance=new LayaBroker({command:[process.execPath,worker,mode],startMs:2000,deadlineMs:3000,...options});t.after(()=>instance.stop());return instance;}
async function within(promise,ms=1000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Unresolved broker operation')),ms);})]);}finally{clearTimeout(timer);}}

test('broker owns input across loading, preserves state cardinality and typed answers',async t=>{
  const b=broker(t),states=['task','second'],questions=structuredClone(question);
  const pending=b.decide(states,questions);states.length=0;questions.kind.criteria={replaced:'different'};
  const reply=await pending;assert.equal(reply.ok,true);assert.equal(reply.results.length,2);
  assert.equal(reply.results[0].answers.kind.choice,'bug');assert.equal(b.info.laya,'protocol-test');
  assert.equal((await b.decide(Array(16).fill('short'),question)).results.length,16);
});
test('one active request has no queue; start callers share readiness',async t=>{
  const b=broker(t);assert.equal(await b.start(),true);
  const running=b.decide(['hang'],question);
  assert.deepEqual(await b.decide(['task'],question),{ok:false,reason:'BUSY'});
  b.stop();assert.deepEqual(await within(running),{ok:false,reason:'UNAVAILABLE'});
  assert.deepEqual(await Promise.all([b.start(),b.start()]),[true,true]);
});
test('deadline includes startup and clears generation; stop resolves startup immediately',async t=>{
  const b=broker(t,'startup-hang');
  const started=performance.now();assert.deepEqual(await within(b.decide(['task'],question,{deadlineMs:100})),{ok:false,reason:'TIMEOUT'});
  assert.ok(performance.now()-started<1000);assert.equal(b.info,null);
  const startup=b.start();b.stop();assert.equal(await within(startup),false);
  const standalone=broker(t,'startup-hang',{startMs:100});assert.equal(await within(standalone.start()),false);
});
test('cancellation interrupts loading and inference, leaves a reusable broker',async t=>{
  const cold=broker(t,'startup-hang'),cancel=new AbortController();
  const pending=cold.decide(['task'],question,{signal:cancel.signal});cancel.abort();
  assert.deepEqual(await within(pending),{ok:false,reason:'CANCELLED'});
  const b=broker(t);await b.start();const controller=new AbortController();
  const running=b.decide(['hang'],question,{signal:controller.signal});controller.abort();
  assert.deepEqual(await within(running),{ok:false,reason:'CANCELLED'});
  assert.equal((await b.decide(['task'],question)).ok,true);
  assert.deepEqual(await b.decide(['task'],question,{signal:controller.signal}),{ok:false,reason:'CANCELLED'});
});
test('later exits and callbacks of stopped generations cannot settle a replacement operation',async t=>{
  const b=broker(t);
  for(let i=0;i<8;i++){
    await b.start();const old=b.decide(['hang'],question);b.stop();
    const next=b.decide(['delay'],question);
    assert.deepEqual(await within(old),{ok:false,reason:'UNAVAILABLE'});
    assert.equal((await next).ok,true);
  }
});
test('invalid inputs refuse before starting a worker and bound the entire JSON request',async t=>{
  const b=broker(t);
  for(const [states,questions,options] of [
    [[],question], [Array(65).fill('x'),question], [['x'.repeat(50001)],question],
    [['x'],{}], [['x'],{q:{type:'execute'}}], [['x'],{q:{type:'choice',criteria:[]}}], [['x'],{q:{type:'score',criteria:{a:'a'}}}], [['x'],{q:{type:'noul',criteria:{other:'a'}}}],
    [['x'],question,null], [['x'],question,{maxLen:0}], [['x'],question,{maxLen:255}], [['x'],question,{maxLen:8193}], [['x'],question,{deadlineMs:Infinity}], [['x'],question,{signal:{aborted:false}}],
    [Array(64).fill('\\'.repeat(50000)),question]
  ])assert.deepEqual(await b.decide(states,questions,options),{ok:false,reason:'INVALID_INPUT'});
  assert.equal(b.info,null);
  const reply=await b.decide(Array(64).fill('x'),Object.fromEntries(Array.from({length:16},(_,i)=>['q'+i,{type:'noul',instructions:'yes?'}])));
  assert.equal(reply.ok,true);assert.equal(reply.results.length,64);
});
test('malformed, oversized and invalid UTF8 output fail closed without exposing raw bytes',async t=>{
  for(const state of ['invalid','oversize','utf8','missing','extra','null','wrong-choice','wrong-count','bad-confidence','bad-probabilities','bad-counter','foreign-probabilities','bad-sum']){
    const b=broker(t);const reply=await b.decide([state],question);
    assert.deepEqual(reply,{ok:false,reason:'INVALID_RESPONSE'});assert.equal(b.info,null);
  }
  for(const mode of ['startup-invalid','startup-large'])assert.deepEqual(await broker(t,mode).decide(['task'],question),{ok:false,reason:'INVALID_RESPONSE'});
});
test('timeout kills worker, three consecutive failures degrade, stop settles a live request',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-laya-worker-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const marker=path.join(directory,'pid'),b=broker(t,'normal',{command:[process.execPath,worker,'normal',marker]});
  await b.start();const pid=Number(fs.readFileSync(marker,'utf8'));
  assert.deepEqual(await b.decide(['hang'],question,{deadlineMs:100}),{ok:false,reason:'TIMEOUT'});
  // Child exits asynchronously; wait on its actual OS lifecycle, not a mocked callback.
  const until=Date.now()+1000;while(Date.now()<until){try{process.kill(pid,0);}catch{break;}await new Promise(resolve=>setTimeout(resolve,10));}
  assert.throws(()=>process.kill(pid,0));
  assert.deepEqual(await b.decide(['hang'],question,{deadlineMs:100}),{ok:false,reason:'TIMEOUT'});
  assert.deepEqual(await b.decide(['hang'],question,{deadlineMs:100}),{ok:false,reason:'TIMEOUT'});
  assert.deepEqual(await b.decide(['task'],question),{ok:false,reason:'DEGRADED'});
});
test('worker inherits only compatible runtime paths and offline flags, no API keys or injection env',async t=>{
  const names=['OPENAI_API_KEY','PYTHONPATH','NODE_OPTIONS'],saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  t.after(()=>{for(const name of names)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];});
  process.env.OPENAI_API_KEY='test-secret';process.env.PYTHONPATH='test-path';process.env.NODE_OPTIONS='--invalid-injected-option';
  const q={kind:{type:'choice',instructions:'Check env.',criteria:{clean:'clean',leaked:'leaked'}}};
  const reply=await broker(t).decide(['env'],q);assert.equal(reply.ok,true);assert.equal(reply.results[0].answers.kind.choice,'clean');
});
test('strict head loss is an explicit abstention, never accepts absent or mismapped answers',async t=>{
  const reply=await broker(t).decide(['head-cut'],question,{strictHead:true});
  assert.equal(reply.ok,true);assert.deepEqual(reply.results[0].answers,{});
  assert.equal(reply.results[0].headTruncated,true);assert.deepEqual(reply.results[0].headWarnings,['kind']);
  const normal=await broker(t).decide(['head-cut'],question);assert.equal(normal.ok,true);assert.equal(normal.results[0].answers.kind.choice,'bug');
  assert.deepEqual(await broker(t).decide(['head-inconsistent'],question,{strictHead:true}),{ok:false,reason:'INVALID_RESPONSE'});
  assert.deepEqual(await broker(t).decide(['head-unknown'],question),{ok:false,reason:'INVALID_RESPONSE'});
  assert.deepEqual(await broker(t).decide(['head-missing'],question,{strictHead:true}),{ok:false,reason:'INVALID_RESPONSE'});
  assert.deepEqual(await broker(t).decide(['x'],question,{strictHead:'yes'}),{ok:false,reason:'INVALID_INPUT'});
});
test('a worker that does not drain stdin cannot cause queued producer requests beyond one frame',async t=>{
  const b=broker(t,'no-read');assert.equal(await b.start(),true);
  const running=b.decide(Array(64).fill('x'.repeat(50000)),question,{deadlineMs:100});
  assert.deepEqual(await b.decide(['x'],question),{ok:false,reason:'BUSY'});
  assert.deepEqual(await within(running),{ok:false,reason:'TIMEOUT'});assert.equal(b.info,null);
});
test('explicit Python selection rejects relative, absent and incompatible executables without fallback',()=>{
  for(const selected of ['', 'python3',path.join(os.tmpdir(),'bbrainx-absent-python'),path.dirname(process.execPath),process.execPath]){
    assert.throws(()=>findPython({...process.env,BBRAINX_PYTHON:selected}),{code:'LAYA_PYTHON_INVALID'});
  }
});
test('explicit Python uses a real supported interpreter; discovery does not mutate PATH',t=>{
  const candidates=[path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'),'python3.12','python3.13','python3.11','python3.10','python3','python'];
  let executable;
  for(const candidate of candidates){
    const found=spawnSync(candidate,['-c','import sys; print(sys.executable); print("%s.%s" % sys.version_info[:2])'],{encoding:'utf8',timeout:2500,maxBuffer:65536,shell:false,windowsHide:true});
    const lines=found.stdout?.trim().split(/\r?\n/);
    if(found.status===0&&/^3\.(10|11|12|13)$/.test(lines?.[1]||'')){executable=lines[0];break;}
  }
  if(!executable)return t.skip('No optional Python 3.10–3.13 available; negative discovery contracts remain tested.');
  const original=process.env.PATH,report=findPython({...process.env,BBRAINX_PYTHON:executable});
  assert.equal(report.tool,fs.realpathSync.native(executable));assert.match(report.version,/^Python 3\.(10|11|12|13)\.\d+$/);
  assert.equal(process.env.PATH,original);
});
test('scores and probability labels obey declared criteria, including upstream rounded distributions',async t=>{
  const score={kind:{type:'score',instructions:'Rate this.',criteria:['none','some','full']}};
  for(const state of ['negative-score','high-score','bad-score-keys'])assert.deepEqual(await broker(t).decide([state],score),{ok:false,reason:'INVALID_RESPONSE'});
  assert.equal((await broker(t).decide(['valid-probabilities'],score,{maxLen:256})).ok,true);
  assert.equal((await broker(t).decide(['valid-probabilities'],question,{maxLen:8192})).ok,true);
});
