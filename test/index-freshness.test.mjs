import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BrainStore} from '../src/store.mjs';
import {indexProject,inspectIndex,requireFreshIndex} from '../src/retrieval.mjs';
import {makeEngine} from '../src/engine.mjs';
const principal={principal:{id:'host'}};
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-freshness-')),root=path.join(dir,'repo'),home=path.join(dir,'state');
  fs.mkdirSync(root);fs.writeFileSync(path.join(root,'source.ts'),'export const firstMarker = 1;');
  const store=new BrainStore(home);store.register('p',root);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {root,home,store,engine:makeEngine(store,['p'])};
}
test('status is read-only and distinguishes missing, current, changed, added and removed',t=>{
  const {root,store}=fixture(t);assert.equal(inspectIndex(store,'p').status,'missing');indexProject(store,'p');
  const changes=()=>store.db.prepare('SELECT total_changes() n').get().n,before=changes();
  assert.equal(inspectIndex(store,'p').status,'current');assert.equal(changes(),before);
  fs.writeFileSync(path.join(root,'source.ts'),'export const otherMarker = 1;');
  fs.writeFileSync(path.join(root,'added.ts'),'export const secondMarker = 2;');
  const stale=inspectIndex(store,'p');assert.equal(stale.status,'stale');
  assert.equal(stale.changes.changed,1);assert.equal(stale.changes.added,1);assert.equal(changes(),before);
  fs.unlinkSync(path.join(root,'source.ts'));assert.equal(inspectIndex(store,'p').changes.removed,1);
  indexProject(store,'p');assert.equal(inspectIndex(store,'p').status,'current');
});
test('same-size edits with preserved mtime cannot fool freshness',t=>{
  const {root,store}=fixture(t),file=path.join(root,'source.ts');indexProject(store,'p');const stat=fs.statSync(file);
  fs.writeFileSync(file,'export const otherMarker = 1;');fs.utimesSync(file,stat.atime,stat.mtime);
  assert.throws(()=>requireFreshIndex(store,'p'),{code:'INDEX_STALE'});
});
test('new symbol refuses both public retrieval routes before refresh, then becomes searchable',async t=>{
  const {root,store,engine}=fixture(t);indexProject(store,'p');fs.writeFileSync(path.join(root,'new.ts'),'export function brandNewFunction() {}');
  for(const name of ['context.search','context.bootstrap']){
    const refused=await engine.invoke(name,{project:'p',query:'brandNewFunction'},principal);
    assert.equal(refused.ok,false);assert.equal(refused.error,'INDEX_STALE');assert.match(refused.detail,/context_index/);
  }
  const status=await engine.invoke('context.index',{project:'p',mode:'status'},principal);assert.equal(status.data.status,'stale');
  assert.equal((await engine.invoke('context.index',{project:'p'},principal)).ok,true);
  const result=await engine.invoke('context.search',{project:'p',query:'brandNewFunction'},principal);
  assert.equal(result.data.items[0].path,'new.ts');assert.equal(result.data.freshness.status,'current');
  assert.equal(result.data.freshness.consistency,'content-hash-scan-not-atomic');
});
test('status bounds changed paths and never emits content or secret values',t=>{
  const {root,store}=fixture(t);indexProject(store,'p');
  for(let i=0;i<40;i++)fs.writeFileSync(path.join(root,'new'+i+'.ts'),'private-body-not-in-report');
  const secret='ghp_'+'A'.repeat(36);fs.writeFileSync(path.join(root,'unsafe.ts'),secret);
  const status=inspectIndex(store,'p'),raw=JSON.stringify(status);
  assert.equal(status.changes.added,40);assert.equal(status.changes.paths.length,25);assert.equal(status.changes.truncated,true);
  assert.equal(status.skippedByReason.SECRET_PATTERN_REJECTED,1);assert(!raw.includes(secret));assert(!raw.includes('private-body-not-in-report'));
});
test('new ignore rules invalidate the indexed manifest and refresh removes excluded files',t=>{
  const {root,store}=fixture(t);execFileSync('git',['init','-q',root]);indexProject(store,'p');
  fs.writeFileSync(path.join(root,'.gitignore'),'source.ts\n');
  assert.equal(inspectIndex(store,'p').changes.removed,1);indexProject(store,'p');
  assert.equal(store.stmt('SELECT count(*) n FROM files WHERE project=?').get('p').n,0);
  assert.equal(inspectIndex(store,'p').status,'current');
});
test('empty indexed corpus is current; a divergent database manifest is stale',t=>{
  const {root,store}=fixture(t);fs.unlinkSync(path.join(root,'source.ts'));indexProject(store,'p');
  assert.equal(inspectIndex(store,'p').status,'current');
  store.stmt('INSERT INTO files(project,path,hash,bytes,kind) VALUES(?,?,?,?,?)').run('p','phantom.ts','a'.repeat(64),1,'source');
  assert.equal(inspectIndex(store,'p').status,'stale');
});
test('status authorization precedes filesystem traversal',async t=>{
  const {engine}=fixture(t);
  await assert.rejects(engine.invoke('context.index',{project:'foreign',mode:'status'},principal),{code:'FORBIDDEN'});
});
test('CLI status exit codes distinguish stale from current and search refuses stale content',t=>{
  const {root,home,store}=fixture(t),entry=fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url));
  const run=(...args)=>spawnSync(process.execPath,[entry,...args,'--project','p'],{encoding:'utf8',env:{...process.env,BBRAINX_HOME:home}});
  assert.equal(run('index-status').status,2);indexProject(store,'p');assert.equal(run('index-status').status,0);
  fs.writeFileSync(path.join(root,'new.ts'),'export const nextMarker = 1;');
  assert.equal(run('index-status').status,2);const result=run('search','--query','nextMarker');
  assert.equal(result.status,1);assert.match(result.stderr,/INDEX_STALE/);
});
