import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { createEngine } from '../src/capability.mjs';
import { BrainStore } from '../src/store.mjs';
import { indexProject } from '../src/retrieval.mjs';
import { compileContext, tokenCount } from '../src/context.mjs';

const input = z.object({ text:z.string() }).strict();
const output = z.object({ value:z.string() }).strict();
function make(overrides={}, observer) {
  return createEngine({name:'contract-regression', version:'1', onEvent:observer,
    capabilities:{ op:{ description:'Contrato local exercitado', input, output, access:'public',
      timeoutMs:40, run:({input})=>({value:input.text}), ...overrides } }});
}
function barrier(){ let release; const promise=new Promise(resolve=>{release=resolve;});return {promise,release}; }
async function settledBefore(promise,ms=400){
  const timer=new AbortController();
  try {return await Promise.race([promise.then(value=>({value}),error=>({error})),delay(ms,'STILL_PENDING',{signal:timer.signal})]);}
  finally {timer.abort();}
}
function expectCode(result,code){assert.notEqual(result,'STILL_PENDING');assert.equal(result.error?.code,code);}
function workspace(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bb-contract-')), repo=path.join(root,'project');fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo,'auth.ts'),'export function validateSession(value: string) { return value.length > 0; }\n');
  const store=new BrainStore(path.join(root,'state'));store.register('project',repo);indexProject(store,'project');
  t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});return {store,repo};
}
const cp={objective:'Revisar sessão',nextAction:'Executar testes',status:'blocked'};
const history=()=>Array.from({length:25},(_,i)=>`Leitura auxiliar ${i}: ${'detalhe '.repeat(25)}`);

test('authorization wait consumes the invocation deadline; no late action runs',async()=>{
  const started=barrier(),finish=barrier();let runs=0;
  const engine=make({access:async()=>{started.release();await finish.promise;return true;},run:()=>{runs++;return {value:'executed'};}});
  const pending=engine.invoke('op',{text:'x'},{principal:{id:'local'}});
  await started.promise;
  const result=await settledBefore(pending);finish.release();await delay(5);
  expectCode(result,'TIMEOUT');assert.equal(runs,0);
});
test('async input validation consumes the same deadline',async()=>{
  const started=barrier(),finish=barrier();let runs=0;
  const schema=input.superRefine(async()=>{started.release();await finish.promise;});
  const engine=make({input:schema,run:()=>{runs++;return {value:'executed'};}});
  const pending=engine.invoke('op',{text:'x'});await started.promise;
  const result=await settledBefore(pending);finish.release();await delay(5);
  expectCode(result,'TIMEOUT');assert.equal(runs,0);
});
test('cancellation during authorization settles without waiting for permission result',async()=>{
  const started=barrier(),finish=barrier(),abort=new AbortController();let runs=0;
  const engine=make({timeoutMs:2000,access:async()=>{started.release();await finish.promise;return true;},run:()=>{runs++;return {value:'executed'};}});
  const pending=engine.invoke('op',{text:'x'},{principal:{id:'local'},signal:abort.signal});await started.promise;abort.abort();
  const result=await settledBefore(pending);finish.release();await delay(5);
  expectCode(result,'CANCELLED');assert.equal(runs,0);
});
test('pre-cancelled invocation does not enter schema refinement or access',async()=>{
  let validation=0,access=0;const abort=new AbortController();abort.abort();
  const engine=make({input:input.superRefine(()=>{validation++;}),access:()=>{access++;return true;}});
  await assert.rejects(engine.invoke('op',{text:'x'},{signal:abort.signal}),{code:'CANCELLED'});
  assert.equal(validation,0);assert.equal(access,0);
});
test('synchronous validation exceeding budget cannot enter the action stage',async()=>{
  let runs=0;const schema=input.superRefine(()=>{const end=performance.now()+15;while(performance.now()<end){/* bounded synchronous workload */}});
  const engine=make({timeoutMs:1,input:schema,run:()=>{runs++;return {value:'executed'};}});
  await assert.rejects(engine.invoke('op',{text:'x'}),{code:'TIMEOUT'});assert.equal(runs,0);
});
test('synchronous action expiration does not claim rollback of its effects',async()=>{
  let effects=0;const engine=make({timeoutMs:5,run:()=>{effects++;const end=performance.now()+20;while(performance.now()<end){}return {value:'committed'};}});
  await assert.rejects(engine.invoke('op',{text:'x'}),{code:'TIMEOUT'});assert.equal(effects,1);
});
test('output validation cannot outlive the invocation deadline',async()=>{
  const finish=barrier();let ran=false;
  const engine=make({output:output.superRefine(async()=>finish.promise),run:()=>{ran=true;return {value:'committed'};}});
  const pending=engine.invoke('op',{text:'x'});const result=await settledBefore(pending);finish.release();
  expectCode(result,'TIMEOUT');assert(ran);
});
test('late validator rejection is owned after timeout',async()=>{
  const finish=barrier(),errors=[];const listener=e=>errors.push(e);process.on('unhandledRejection',listener);
  try{
    const engine=make({input:input.superRefine(async()=>{await finish.promise;throw new Error('private-data');})});
    const result=await settledBefore(engine.invoke('op',{text:'x'}));finish.release();await delay(20);
    expectCode(result,'TIMEOUT');assert.equal(errors.length,0);assert(!String(result.error).includes('private-data'));
  }finally{process.removeListener('unhandledRejection',listener);}
});
test('principal is snapshotted before asynchronous input validation',async()=>{
  const started=barrier(),finish=barrier();
  const engine=make({timeoutMs:2000,input:input.superRefine(async()=>{started.release();await finish.promise;}),access:({principal})=>principal?.id==='allowed'});
  const principal={id:'denied'},pending=engine.invoke('op',{text:'x'},{principal});
  await started.promise;principal.id='allowed';finish.release();await assert.rejects(pending,{code:'FORBIDDEN'});
});
test('authorization receives the deadline signal but cannot mutate execution identity',async()=>{
  const engine=make({access:({principal,context})=>{assert(context.signal instanceof AbortSignal);principal.id='mutated';return true;},run:({context})=>({value:context.principal.id})});
  assert.deepEqual(await engine.invoke('op',{text:'x'},{principal:{id:'host'}}),{value:'host'});
});
test('catalog descriptors cannot be changed through a prior caller',()=>{
  const engine=make();const description=engine.describe('op');description.inputSchema.properties.text.type='number';
  description.outputSchema.required.push('secret');
  assert.equal(engine.describe('op').inputSchema.properties.text.type,'string');
  assert.deepEqual(engine.describe('op').outputSchema.required,['value']);
});
test('each descriptor has detached arrays and preserves schema truth',async()=>{
  const engine=make(),a=engine.describe('op'),b=engine.describe('op');assert.notEqual(a,b);assert.notEqual(a.inputSchema,b.inputSchema);
  assert.deepEqual(await engine.invoke('op',{text:'valid'}),{value:'valid'});
  await assert.rejects(engine.invoke('op',{text:123}),{code:'INPUT_INVALID'});
});
test('observer receives no raw arguments on a deadline failure',async()=>{
  const events=[],gate=barrier(),engine=make({access:async()=>{await gate.promise;return true;}},event=>events.push(event));
  const result=await settledBefore(engine.invoke('op',{text:'PRIVATE_INPUT'},{principal:{id:'local'}}));gate.release();
  expectCode(result,'TIMEOUT');assert.equal(events.filter(e=>e.type==='invocation.failed').length,1);assert(!JSON.stringify(events).includes('PRIVATE_INPUT'));
});
test('normal denied and successful action retain stable error/output contracts',async()=>{
  const engine=make({access:({principal})=>principal?.id==='local'});
  await assert.rejects(engine.invoke('op',{text:'x'}),{code:'UNAUTHENTICATED'});
  await assert.rejects(engine.invoke('op',{text:'x'},{principal:{id:'other'}}),{code:'FORBIDDEN'});
  assert.deepEqual(await engine.invoke('op',{text:'x'},{principal:{id:'local'}}),{value:'x'});
});
test('trimmed checkpoints retain every decision and blocker verbatim',t=>{
  const {store}=workspace(t);
  store.checkpoint('project','TASK',{...cp,done:history(),decisions:['Não alterar a API pública.'],blockers:['REVIEW_SECURITY_PENDING']},0,'create');
  const pack=compileContext(store,{project:'project',task:'TASK',query:'validateSession',budget:1000});
  assert(pack.checkpointTrimmed);assert(pack.text.includes('Não alterar a API pública.'));assert(pack.text.includes('REVIEW_SECURITY_PENDING'));
  assert(!pack.text.includes('Leitura auxiliar 24:'));assert.equal(pack.payloadTokens,tokenCount(pack.text));assert(pack.payloadTokens<=1000);
});
test('large mandatory blockers reject instead of becoming counts',t=>{
  const {store}=workspace(t);store.checkpoint('project','TASK',{...cp,blockers:Array.from({length:10},(_,i)=>`${i} ${'restrição obrigatória '.repeat(20)}`)},0,'create');
  const before=store.events('project').filter(e=>e.type==='context.compiled').length;
  assert.throws(()=>compileContext(store,{project:'project',task:'TASK',query:'validateSession',budget:512}),{code:'MANDATORY_CONTEXT_EXCEEDS_BUDGET'});
  assert.equal(store.events('project').filter(e=>e.type==='context.compiled').length,before);
});
test('large mandatory decisions reject even when no blockers exist',t=>{
  const {store}=workspace(t);store.checkpoint('project','TASK',{...cp,decisions:Array.from({length:10},(_,i)=>`${i} ${'preservar decisão arquitetural '.repeat(15)}`)},0,'create');
  assert.throws(()=>compileContext(store,{project:'project',task:'TASK',query:'validateSession',budget:512}),{code:'MANDATORY_CONTEXT_EXCEEDS_BUDGET'});
});
test('checkpoint absence and empty lists retain exact token budgeting',t=>{
  const {store}=workspace(t);const noTask=compileContext(store,{project:'project',query:'validateSession',budget:800});assert.equal(noTask.checkpointTrimmed,false);
  store.checkpoint('project','TASK',{...cp,done:history(),decisions:[],blockers:[]},0,'create');
  const pack=compileContext(store,{project:'project',task:'TASK',query:'validateSession',budget:800});
  assert(pack.text.includes('"decisions":[]'));assert(pack.text.includes('"blockers":[]'));assert.equal(pack.payloadTokens,tokenCount(pack.text));
});
test('stale checkpoint retains explicit warning and its blockers',t=>{
  const {store,repo}=workspace(t);store.checkpoint('project','TASK',{...cp,done:history(),blockers:['VERIFY_DEPLOYMENT']},0,'create');
  fs.appendFileSync(path.join(repo,'auth.ts'),'\nexport const revision = 2;');indexProject(store,'project');
  const pack=compileContext(store,{project:'project',task:'TASK',query:'validateSession',budget:1000});
  assert(pack.checkpointStale);assert(pack.text.includes('WARNING: checkpoint belongs to a different snapshot'));assert(pack.text.includes('VERIFY_DEPLOYMENT'));
});
test('freshness cache is per invocation: second call rejects newly changed file',t=>{
  const {store,repo}=workspace(t);compileContext(store,{project:'project',query:'validateSession',budget:800});
  fs.appendFileSync(path.join(repo,'auth.ts'),'\nexport const changed = 1;');
  assert.throws(()=>compileContext(store,{project:'project',query:'validateSession',budget:800,onStale:'fail'}),{code:'STALE_INDEX'});
});
test('approved mandatory memory is not sacrificed to preserve decisions',t=>{
  const {store}=workspace(t),m=store.proposeMemory('project','policy '.repeat(350),'ADR');store.reviewMemory('project',m.id,'approved',1);
  store.checkpoint('project','TASK',{...cp,decisions:['Keep API.']},0,'create');
  assert.throws(()=>compileContext(store,{project:'project',task:'TASK',query:'validateSession',budget:256}),{code:'MANDATORY_CONTEXT_EXCEEDS_BUDGET'});
});
