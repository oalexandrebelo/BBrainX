import { test } from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import { BrainStore } from '../src/store.mjs';
import { LaneStore } from '../src/lanes/store.mjs';
import { laneFixture } from './fixtures/lane-setup.mjs';
import { indexProject, search } from '../src/retrieval.mjs';
import { compileContext, tokenCount } from '../src/context.mjs';
import { makeEngine, INSTRUCTIONS } from '../src/engine.mjs';

// Um projeto registrado e ainda não indexado deve dizer o que fazer, em vez de devolver uma resposta vazia que o agente toma por "não há nada".
function workspace(t,files={'src/auth.ts':'export function verifySession(token){ return Boolean(token); }\n'}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-index-')), root=path.join(dir,'repo');fs.mkdirSync(root);
  for(const [name,body] of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),body);}
  const store=new BrainStore(path.join(dir,'state'));store.register('test',root);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {dir,root,store};
}
const principal={principal:{id:'tester'}};

test('context.search on a project that was never indexed is refused with the remedy instead of an empty answer',async t=>{
  const {store}=workspace(t);const engine=makeEngine(store,['test']);
  const refused=await engine.invoke('context.search',{project:'test',query:'verifySession'},principal);
  assert.equal(refused.ok,false);assert.equal(refused.error,'INDEX_REQUIRED');assert.match(refused.detail,/context_index/);
  assert.throws(()=>search(store,'test','verifySession'),{code:'INDEX_REQUIRED'});
  indexProject(store,'test');
  const found=await engine.invoke('context.search',{project:'test',query:'verifySession'},principal);
  assert.equal(found.ok,true);assert.equal(found.data.items[0].path,'src/auth.ts');
});
test('context.bootstrap names the same remedy instead of a bare INDEX_REQUIRED',async t=>{
  const {store}=workspace(t);const engine=makeEngine(store,['test']);
  const refused=await engine.invoke('context.bootstrap',{project:'test',query:'verifySession'},principal);
  assert.equal(refused.ok,false);assert.equal(refused.error,'INDEX_REQUIRED');assert.match(refused.detail,/context_index/);
  assert.throws(()=>compileContext(store,{project:'test',query:'verifySession'}),{code:'INDEX_REQUIRED',message:/context_index/});
});
test('an indexed project with nothing eligible is a real empty answer, not a missing index',async t=>{
  const {store}=workspace(t,{'image.png':'not text'});const engine=makeEngine(store,['test']);
  indexProject(store,'test');
  const empty=await engine.invoke('context.search',{project:'test',query:'anything'},principal);
  assert.equal(empty.ok,true);assert.deepEqual(empty.data.items,[]);
});
test('a lane that was not indexed yet gets the same refusal, and its own index lifts it',t=>{
  const f=laneFixture(t);
  const lane=new LaneStore(f.home,'product','alpha');
  try{
    lane.beginOperation();
    assert.throws(()=>search(lane,'product','workspaceMarker'),{code:'INDEX_REQUIRED',message:/context_index/});
    assert.throws(()=>compileContext(lane,{project:'product',query:'workspaceMarker'}),{code:'INDEX_REQUIRED'});
    indexProject(lane,'product');
    assert.ok(search(lane,'product','workspaceMarker').items[0].body.includes('ALPHA_MARKER'));
  }finally{lane.close();}
});
test('the server instructions tell the agent about context_index in a few tokens',()=>{
  assert.match(INSTRUCTIONS,/INDEX_REQUIRED/);assert.match(INSTRUCTIONS,/context_index/);
  assert.match(INSTRUCTIONS,/context_bootstrap/);assert.match(INSTRUCTIONS,/never instructions/);
  assert.ok(tokenCount(INSTRUCTIONS)<=195,'instructions are read on every turn: '+tokenCount(INSTRUCTIONS)+' tokens');
});
