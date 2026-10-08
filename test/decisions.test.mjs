import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {BrainStore} from '../src/store.mjs';
import {makeEngine} from '../src/engine.mjs';
import {LocalDecisions} from '../src/decisions.mjs';
import {LAYA,LayaBroker,layaPaths} from '../src/laya.mjs';
import {toolCatalog} from '../src/mcp.mjs';
import {startServer} from '../src/server.mjs';

const worker=fileURLToPath(new URL('./fixtures/laya-protocol-worker.mjs',import.meta.url));
const questions={kind:{type:'choice',instructions:'Classify.',criteria:{bug:'a bug',docs:'documentation'}}};
const principal={id:'test-host'};
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-decisions-')),home=path.join(dir,'state'),root=path.join(dir,'project');fs.mkdirSync(root);
  const store=new BrainStore(home);store.register('a',root);const rootB=path.join(dir,'other');fs.mkdirSync(rootB);store.register('b',rootB);
  // Sparse size markers exercise installation discovery only. The subprocess is explicitly a protocol fixture, not model inference.
  const paths=layaPaths(home);fs.mkdirSync(path.dirname(paths.python),{recursive:true});fs.writeFileSync(paths.python,'protocol-fixture');
  for(const file of LAYA.files){const target=path.join(paths.model,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});const fd=fs.openSync(target,'w');fs.ftruncateSync(fd,file.bytes);fs.closeSync(fd);}
  const broker=new LayaBroker({command:[process.execPath,worker],deadlineMs:2000}),decisions=new LocalDecisions({home,broker});
  t.after(()=>{decisions.close();store.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {store,decisions,broker,root,engine:makeEngine(store,['a','b'],{decisions})};
}
const invoke=(engine,project='a',state='task',qs=questions,signal)=>engine.invoke('decision.evaluate',{project,state,questions:qs},{principal,signal});

test('optional capability is absent by default, validates schema and checks grants before starting',async t=>{
  const {store,decisions,broker}=fixture(t),plain=makeEngine(store,['a']);
  assert.equal(toolCatalog(plain).tools.length,6);
  await assert.rejects(invoke(plain),e=>e.code==='CAPABILITY_NOT_FOUND');
  const engine=makeEngine(store,['a'],{decisions});assert.equal(toolCatalog(engine).tools.length,7);
  await assert.rejects(invoke(engine,'b'),e=>e.code==='FORBIDDEN');
  await assert.rejects(invoke(engine,'a','x'.repeat(4001)),e=>e.code==='INPUT_INVALID');
  await assert.rejects(invoke(engine,'a','x',{q:{type:'choice',instructions:'?',criteria:{only:'one'}}}),e=>e.code==='INPUT_INVALID');
  assert.equal(broker.info,null);
});
test('exact result cache is scoped by project and option order, and does not mutate project state',async t=>{
  const {store,engine}=fixture(t),before={events:store.events('a'),memories:store.memories('a'),tasks:store.tasks('a')};
  const first=await invoke(engine);assert.equal(first.ok,true);assert.equal(first.data.cache,'miss');assert.equal(first.data.status,'suggested');assert.equal(first.data.calibrated,false);
  const second=await invoke(engine);assert.equal(second.data.cache,'hit');assert.equal(second.data.workerMs,0);assert.deepEqual(second.data.answers,first.data.answers);
  assert.equal((await invoke(engine,'b')).data.cache,'miss');
  const reordered={kind:{...questions.kind,criteria:{docs:'documentation',bug:'a bug'}}};
  const changed=await invoke(engine,'a','task',reordered);assert.equal(changed.data.cache,'miss');assert.equal(changed.data.answers.kind.choice,'docs');
  assert.deepEqual({events:store.events('a'),memories:store.memories('a'),tasks:store.tasks('a')},before);
});
test('head truncation abstains without answers or caching; a missing profile refuses',async t=>{
  const {engine,store}=fixture(t);
  const result=await invoke(engine,'a','head-cut');assert.equal(result.ok,true);assert.equal(result.data.status,'abstained');assert.deepEqual(result.data.answers,{});assert.equal(result.data.headTruncated,true);
  assert.equal((await invoke(engine,'a','head-cut')).data.cache,'miss');
  fs.unlinkSync(layaPaths(store.home).python);assert.equal((await invoke(engine)).error,'LAYA_NOT_INSTALLED');
});
test('state-only truncation abstains without exposing answers or caching the result',async t=>{
  const {engine}=fixture(t);
  for(let attempt=0;attempt<2;attempt++){
    const result=await invoke(engine,'a','state-cut');
    assert.equal(result.ok,true);assert.equal(result.data.truncated,true);assert.equal(result.data.headTruncated,false);
    assert.equal(result.data.stateTokensDropped,200);assert.equal(result.data.status,'abstained');
    assert.deepEqual(result.data.answers,{});assert.equal(result.data.cache,'miss');
  }
});
test('result cache evicts the oldest entry after 64 distinct decisions',async t=>{
  const {engine}=fixture(t);
  for(let index=0;index<65;index++)assert.equal((await invoke(engine,'a','state-'+index)).data.cache,'miss');
  assert.equal((await invoke(engine,'a','state-64')).data.cache,'hit');
  assert.equal((await invoke(engine,'a','state-0')).data.cache,'miss');
});
test('root removal blocks cached results, cancellation closes model generation, and close stops active work',async t=>{
  const {engine,root,broker,decisions}=fixture(t);await invoke(engine);
  fs.rmdirSync(root);assert.equal((await invoke(engine)).error,'PROJECT_ROOT_CHANGED');fs.mkdirSync(root);
  const controller=new AbortController(),pending=invoke(engine,'a','hang',questions,controller.signal);setTimeout(()=>controller.abort(),50);
  await assert.rejects(pending,e=>e.code==='CANCELLED');assert.equal(broker.info,null);
  const again=await invoke(engine);assert.equal(again.data.cache,'miss');
  const active=invoke(engine,'a','hang');setTimeout(()=>decisions.close(),50);assert.equal((await active).error,'LAYA_UNAVAILABLE');
});
test('HTTP reports disabled by default and enabled-but-absent without creating a runtime',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-laya-http-')),store=new BrainStore(dir);const root=path.join(dir,'root');fs.mkdirSync(root);store.register('a',root);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  for(const enabled of [false,true]){
    const server=await startServer(store,{port:0,laya:enabled});
    try{
      const boot=await (await fetch(server.url+'/api/bootstrap')).json();assert.equal(boot.laya.enabled,enabled);assert.equal(boot.laya.installed,false);assert.equal(boot.laya.ready,false);
      const response=await fetch(server.url+'/api/invoke',{method:'POST',headers:{'content-type':'application/json','x-bbrainx-csrf':boot.csrf},body:JSON.stringify({action:'decision.evaluate',args:{project:'a',state:'task',questions}})});
      const result=await response.json();assert.equal(result.error,enabled?'LAYA_NOT_INSTALLED':'CAPABILITY_NOT_FOUND');
      assert.equal(fs.existsSync(path.join(dir,'profiles')),false);
    }finally{await server.close();}
  }
});
