import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { LayaBroker, fetchWeights, layaPaths } from '../src/laya.mjs';
import { validLayaReply } from '../src/laya-transport.mjs';
import { createHash } from 'node:crypto';
const question={q:{type:'noul',instructions:'Transport contract only'}};
function fixture(t,mode='normal',options={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bb-worker-')),audit=path.join(root,'events.jsonl');
  const broker=new LayaBroker({command:[process.execPath,fileURLToPath(new URL('./fixtures/serial-worker.mjs',import.meta.url)),mode,audit],
    startMs:10000,deadlineMs:1000,...options});
  t.after(async()=>{await broker.stop();fs.rmSync(root,{recursive:true,force:true});});
  const events=()=>fs.existsSync(audit)?fs.readFileSync(audit,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)):[];
  return {broker,events};
}
test('one request admission before cold start: a second caller is refused without hidden work',async t=>{
  const {broker,events}=fixture(t,'slow-ready');
  const first=broker.decide(['one'],question);
  assert.deepEqual(await broker.decide(['two'],question),{ok:false,reason:'BUSY'});
  assert.equal((await first).ok,true);assert.equal(events().filter(x=>x.event==='request').length,1);
  assert.equal(broker.stats().queueLength,0);
});
test('timeout retires generation before another inference is admitted',async t=>{
  const {broker}=fixture(t,'hang-first');
  for(let i=0;i<2;i++)assert.deepEqual(await broker.decide(['one'],question,{deadlineMs:30}),{ok:false,reason:'TIMEOUT'});
  assert.equal(broker.stats().spawned,2);assert.equal(broker.stats().processClosedObserved,true);
});
test('one ready handshake can serve many callers of start without duplicate processes',async t=>{
  const {broker}=fixture(t,'slow-ready');assert((await Promise.all(Array.from({length:20},()=>broker.start()))).every(Boolean));
  assert.equal(broker.stats().spawned,1);
});
for(const [mode,reason] of [['foreign-id','PROTOCOL_ERROR'],['malformed','PROTOCOL_ERROR'],['invalid-utf8','PROTOCOL_ERROR'],
 ['oversize','RESPONSE_TOO_LARGE'],['wrong-count','INVALID_RESPONSE'],['invalid-value','INVALID_RESPONSE'],['missing-usage','INVALID_RESPONSE'],['crash','UNAVAILABLE']])
 test('real malformed worker is retired: '+mode,async t=>{
  const {broker}=fixture(t,mode,{maxFrameBytes:4096});assert.deepEqual(await broker.decide(['one'],question),{ok:false,reason});
  assert.equal(broker.stats().processClosedObserved,true);
 });
test('UTF8 split across stdout chunks is decoded only after a complete frame',async t=>{
  const {broker}=fixture(t,'split');assert.equal((await broker.decide(['á😀'],question)).ok,true);assert.equal(broker.info.laya,'transport-fixturé');
});
test('unknown token usage remains unknown, without pretending zero cost or no truncation',async t=>{
  const {broker}=fixture(t,'unknown-usage');const r=await broker.decide(['one'],question);
  assert(r.ok);assert.equal(r.results[0].truncated,null);assert.equal(r.results[0].inputTokens,null);assert.equal(r.results[0].stateTokensDropped,null);
});
test('request snapshot is not replaced by caller mutation during model startup',async t=>{
  const {broker,events}=fixture(t,'slow-ready'),states=['original'];const work=broker.decide(states,question);states[0]='changed';
  assert.equal((await work).ok,true);assert.deepEqual(events().find(x=>x.event==='request').states,['original']);
});
test('bounded input refuses large batch before spawning a child',async t=>{
  const {broker}=fixture(t);assert.equal((await broker.decide(Array(65).fill('x'),question)).reason,'INVALID_REQUEST');
  assert.equal((await broker.decide(Array(64).fill('x'),question,{maxLen:8192})).reason,'INVALID_REQUEST');
  assert.equal(broker.stats().spawned,0);
});
test('abort before admission starts no worker; abort in flight does not free a living generation',async t=>{
  const {broker}=fixture(t,'ignore-term',{graceMs:40,shutdownMs:1000});
  const early=new AbortController();early.abort();assert.equal((await broker.decide(['x'],question,{signal:early.signal})).reason,'CANCELLED');
  assert.equal(broker.stats().spawned,0);await broker.start();
  const c=new AbortController(),work=broker.decide(['x'],question,{signal:c.signal});
  await new Promise(r=>setTimeout(r,20));c.abort();
  assert.equal((await work).reason,'CANCELLED');assert.equal(broker.stats().processClosedObserved,true);
});
test('stop terminates an unresponsive worker and restart gets a fresh generation',async t=>{
  const {broker}=fixture(t,'ignore-term',{graceMs:40,shutdownMs:1000});await broker.start();const g=broker.stats().generation;
  const p=broker.decide(['x'],question);await new Promise(r=>setTimeout(r,10));await broker.stop();
  assert.equal((await p).ok,false);assert.equal(broker.stats().processClosedObserved,true);
  assert.equal(await broker.start(),true);assert.notEqual(broker.stats().generation,g);
});
test('startup refusal and missing executable return bounded failures without throwing',async t=>{
  const {broker}=fixture(t,'refuse');assert.equal((await broker.decide(['one'],question)).reason,'UNAVAILABLE');assert.equal(broker.stats().processClosedObserved,true);
  const absent=new LayaBroker({command:[path.join(os.tmpdir(),'no-bb-worker-executable')]});
  t.after(()=>absent.stop());assert.equal((await absent.decide(['one'],question)).reason,'UNAVAILABLE');
});
test('three reported failures open circuit; admission refusal does not count as inference failure',async t=>{
  const {broker}=fixture(t,'error');for(let i=0;i<3;i++)assert.equal((await broker.decide(['one'],question)).reason,'ERROR');
  assert.equal((await broker.decide(['one'],question)).reason,'DEGRADED');assert.equal(broker.stats().requests,3);
});
test('choice and score validation checks values, domain and normalization',()=>{
  const state={states:['x'],questions:{q:{type:'choice',criteria:{a:'A',b:'B'}}}}, row={answers:{q:{choice:'a',probabilities:{a:.6,b:.4}}},truncated:false,inputTokens:1,stateTokensDropped:0};
  const m={ok:true,ms:1,results:[row]};assert(validLayaReply(m,state));row.answers.q.probabilities.b=.8;assert(!validLayaReply(m,state));
  state.questions.q={type:'score',criteria:['low','high']};row.answers.q={score:0,probabilities:[0,1]};assert(!validLayaReply(m,state));
  row.answers.q.score=1;assert(validLayaReply(m,state));
});
test('concurrent content-identical downloads have exclusive temporary files and no leftovers',async t=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'bb-download-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const bytes=Buffer.from('non-model-test-content'),files=[{path:'probe.bin',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}];
  const fetchImpl=async()=>new Response(new ReadableStream({start(controller){setTimeout(()=>{controller.enqueue(bytes);controller.close();},10);}}));
  await Promise.all([fetchWeights({home,files,fetchImpl}),fetchWeights({home,files,fetchImpl})]);
  assert.deepEqual(fs.readdirSync(layaPaths(home).model),['probe.bin']);assert.deepEqual(fs.readFileSync(path.join(layaPaths(home).model,'probe.bin')),bytes);
});
