import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import * as transport from '../src/laya-transport.mjs';
import {LayaBroker,LayaTransportBroker} from '../src/laya.mjs';
// Both brokers must only send requests that profiles/laya/worker.py's admission accepts, and a refusal that still reaches
// the worker must come back as a typed {ok:false}, never a hang. No model: a JS stand-in and the real worker.py main()
// with the model stubbed (when python3 exists) play the worker.
const jsWorker=fileURLToPath(new URL('./fixtures/envelope-worker.mjs',import.meta.url));
const pyRunner=fileURLToPath(new URL('./fixtures/laya-worker-stub-runner.py',import.meta.url));
const profile=fileURLToPath(new URL('../profiles/laya/',import.meta.url));
const python=(()=>{const probe=spawnSync('python3',['-I','-c','import sys; assert sys.version_info >= (3, 8)'],{timeout:5000});return probe.status===0?'python3':null;})();
const within=async(promise,ms=3000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('broker call did not settle')),ms);})]);}finally{clearTimeout(timer);}};
const audit=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-envelope-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'events.jsonl');
  return {file,events:()=>fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[]};};
const kinds={
  LayaTransportBroker:command=>new LayaTransportBroker({command,startMs:10000,deadlineMs:5000}),
  LayaBroker:command=>new LayaBroker({command,startMs:10000,deadlineMs:5000})
};
// Independent oracle, written from worker.py: counts, maxLen range, batch rows and batch tokens.
const envelope=(states,questions,maxLen)=>states>=1&&states<=64&&questions>=1&&questions<=16&&states*questions<=128&&states*questions*maxLen<=131072;
const expected={
  // LayaTransport always puts maxLen on the wire (default 1024) and admits the worker's whole 32..8192 range.
  LayaTransportBroker:(s,q,m)=>m===undefined?envelope(s,q,1024):m>=32&&m<=8192&&envelope(s,q,m),
  // LayaBroker omits maxLen by default (worker falls back to 512) and keeps its stricter 256 floor.
  LayaBroker:(s,q,m)=>m===undefined?envelope(s,q,512):m>=256&&m<=8192&&envelope(s,q,m)
};
const questionsOf=n=>Object.fromEntries(Array.from({length:n},(_,i)=>['q'+i,{type:'noul',instructions:'Transport envelope only.'}]));
const grid=[];for(const s of [1,2,43,64,65])for(const q of [1,2,3,16,17])for(const m of [undefined,31,32,255,256,512,1024,1025,8192,8193])grid.push([s,q,m]);
const label=(s,q,m)=>s+' states x '+q+' questions, maxLen '+m;
async function classify(broker,s,q,m){
  const reply=await within(broker.decide(Array(s).fill('x'),questionsOf(q),m===undefined?{}:{maxLen:m}));
  if(reply.ok)return 'accepted';
  return ['INVALID_REQUEST','INVALID_INPUT'].includes(reply.reason)?'refused-locally':'worker-refused:'+reply.reason;
}

test('JS envelope constants are the ones in profiles/laya/worker.py (and in the JS stand-in)',()=>{
  const read=(file)=>fs.readFileSync(file,'utf8');
  const constant=(source,name)=>{const hit=source.match(new RegExp('\\b'+name+'\\s*=\\s*([0-9][0-9 *]*)'));assert.ok(hit,name+' not found');return hit[1].split('*').map(Number).reduce((a,b)=>a*b,1);};
  const py=read(path.join(profile,'worker.py')),standIn=read(jsWorker);
  const fromPython={maxStates:constant(py,'MAX_STATES'),maxQuestions:constant(py,'MAX_QUESTIONS'),maxStateChars:constant(py,'MAX_STATE_CHARS'),
    maxRows:constant(py,'MAX_BATCH_ROWS'),maxBatchTokens:constant(py,'MAX_BATCH_TOKENS')};
  const range=py.match(/not (\d+) <= max_len <= (\d+)/),fallback=py.match(/agent\.cfg\.get\("max_len", (\d+)\)/);
  assert.ok(range&&fallback,'maxLen range and fallback must be found in worker.py');
  fromPython.minLen=Number(range[1]);fromPython.maxLen=Number(range[2]);fromPython.workerDefaultLen=Number(fallback[1]);
  const E=transport.LAYA_ENVELOPE;assert.ok(E,'LAYA_ENVELOPE must be exported by src/laya-transport.mjs');
  assert.deepEqual({...E},fromPython);
  assert.deepEqual({MAX_STATES:constant(standIn,'MAX_STATES'),MAX_QUESTIONS:constant(standIn,'MAX_QUESTIONS'),MAX_STATE_CHARS:constant(standIn,'MAX_STATE_CHARS'),
    MAX_BATCH_ROWS:constant(standIn,'MAX_BATCH_ROWS'),MAX_BATCH_TOKENS:constant(standIn,'MAX_BATCH_TOKENS'),DEFAULT_MAX_LEN:constant(standIn,'DEFAULT_MAX_LEN')},
    {MAX_STATES:fromPython.maxStates,MAX_QUESTIONS:fromPython.maxQuestions,MAX_STATE_CHARS:fromPython.maxStateChars,MAX_BATCH_ROWS:fromPython.maxRows,
     MAX_BATCH_TOKENS:fromPython.maxBatchTokens,DEFAULT_MAX_LEN:fromPython.workerDefaultLen});
});
for(const [name,make] of Object.entries(kinds)){
  test(name+' admits exactly the requests the worker envelope accepts and never forwards one it would refuse',async t=>{
    const log=audit(t),broker=make([process.execPath,jsWorker,log.file]);t.after(async()=>{await broker.stop();});
    for(const [s,q,m] of grid)assert.equal(await classify(broker,s,q,m),expected[name](s,q,m)?'accepted':'refused-locally',name+': '+label(s,q,m));
    assert.deepEqual(log.events().filter(event=>event.event==='refused'),[],'the worker never saw an over-envelope request');
    assert.equal(log.events().filter(event=>event.event==='spawn').length,1,'refusals before the worker do not start one per request');
  });
  test(name+' against the real worker.py admission (model stubbed): every forwarded request is accepted',{skip:!python&&'python3 is not available'},async t=>{
    const broker=make([python,'-I',pyRunner,profile]);t.after(async()=>{await broker.stop();});
    for(const [s,q,m] of grid)assert.equal(await classify(broker,s,q,m),expected[name](s,q,m)?'accepted':'refused-locally','worker.py via '+name+': '+label(s,q,m));
  });
  test(name+' turns a refusal that does reach the worker into a typed failure, keeps the worker, and recovers from an unattributable one',async t=>{
    const log=audit(t),broker=make([process.execPath,jsWorker,log.file]);t.after(async()=>{await broker.stop();});
    const refused=await within(broker.decide(['refuse'],questionsOf(1)));
    assert.equal(refused.ok,false);assert.equal(refused.reason,'ERROR');
    assert.equal((await within(broker.decide(['fine'],questionsOf(1)))).ok,true,'a refusal is not a crash');
    assert.equal(log.events().filter(event=>event.event==='spawn').length,1);
    // worker.py answers an oversized frame with id:null; it cannot be matched to a request and must not leave the caller waiting.
    const unattributable=await within(broker.decide(['refuse-null-id'],questionsOf(1)));
    assert.equal(unattributable.ok,false);assert.match(unattributable.reason,/^(PROTOCOL_ERROR|INVALID_RESPONSE)$/);
    assert.equal((await within(broker.decide(['fine'],questionsOf(1)))).ok,true);
    assert.equal(log.events().filter(event=>event.event==='spawn').length,2,'the generation that could not be trusted was replaced');
  });
}
