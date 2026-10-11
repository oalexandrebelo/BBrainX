import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { once } from 'node:events';
import { BrainStore } from '../src/store.mjs';
import { saveCheckpoint } from '../src/session.mjs';
import { indexProject } from '../src/retrieval.mjs';
import { hash } from '../src/primitives.mjs';

function fixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-checkpoint-replay-'));
  const root=path.join(directory,'repo'),home=path.join(directory,'state');
  fs.mkdirSync(root);fs.writeFileSync(path.join(root,'entry.mjs'),'export const fixture = 1;\n');
  childProcess.execFileSync('git',['init','-q',root]);
  childProcess.execFileSync('git',['-C',root,'add','.']);
  childProcess.execFileSync('git',['-C',root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=/dev/null','commit','-qm','fixture']);
  const store=new BrainStore(home);store.register('project',root);indexProject(store,'project');
  const handles=[store];
  t.after(()=>{for(const handle of handles)handle.close();fs.rmSync(directory,{recursive:true,force:true});});
  const openPeer=()=>{const peer=new BrainStore(home);handles.push(peer);return peer;};
  const request={project:'project',task:'task',content:{objective:'Record fixture',nextAction:'Resume fixture',status:'paused',filesTouched:['src/entry.mjs']},expectedVersion:0,idempotencyKey:'attempt'};
  return {root,home,store,request,openPeer};
}

// Observe the real Git call rather than replace its response. The host imports a named builtin export.
function observeGit(run,onGit=()=>{}) {
  const original=childProcess.spawnSync;let calls=0;
  childProcess.spawnSync=function(...args){
    if(args[0]==='git'&&args[1].includes('rev-parse')){calls++;onGit();}
    return original.apply(this,args);
  };
  syncBuiltinESMExports();
  try{return {value:run(),calls};}
  finally{childProcess.spawnSync=original;syncBuiltinESMExports();}
}

for(const explicitSnapshot of [false,true])test(`checkpoint replay preserves its original response without Git (snapshot ${explicitSnapshot?'declared':'omitted'})`,t=>{
  const {store,root,request}=fixture(t);
  if(explicitSnapshot)request.content.snapshot=store.project('project').snapshot;
  const first=saveCheckpoint(store,request);
  // Replay remains valid after both task version and indexed source have advanced.
  fs.appendFileSync(path.join(root,'entry.mjs'),'export const changed = 2;\n');
  indexProject(store,'project');
  const second=saveCheckpoint(store,{...request,content:{...request.content,snapshot:store.project('project').snapshot,nextAction:'Continue'},expectedVersion:1,idempotencyKey:'next'});
  const eventsBefore=store.events('project'),historyBefore=store.db.prepare('SELECT * FROM task_history ORDER BY version').all();
  const observed=observeGit(()=>saveCheckpoint(store,request));
  assert.deepEqual(observed.value,first);
  assert.equal(hash(observed.value),hash(first));
  assert.equal(observed.calls,0,'a committed response needs no fresh Git observation');
  assert.deepEqual(store.task('project','task'),second);
  assert.deepEqual(store.events('project'),eventsBefore);
  assert.deepEqual(store.db.prepare('SELECT * FROM task_history ORDER BY version').all(),historyBefore);
});

test('replay validates normalized fingerprint, scope and input before returning',t=>{
  const {store,request}=fixture(t),first=saveCheckpoint(store,request);
  const observed=observeGit(()=>{
    assert.deepEqual(saveCheckpoint(store,{...request,content:{...request.content,filesTouched:['src\\entry.mjs']}}),first);
    for(const change of [{task:'another'},{expectedVersion:1},{content:{...request.content,nextAction:'Different'}}]){
      assert.throws(()=>saveCheckpoint(store,{...request,...change}),{code:'IDEMPOTENCY_CONFLICT'});
    }
    assert.throws(()=>saveCheckpoint(store,{...request,expectedVersion:-1}),{code:'INVALID_VERSION'});
    assert.throws(()=>saveCheckpoint(store,{...request,task:'../task'}),{code:'INVALID_ID'});
    assert.throws(()=>saveCheckpoint(store,{...request,idempotencyKey:'../attempt'}),{code:'INVALID_ID'});
    assert.throws(()=>saveCheckpoint(store,{...request,content:{...request.content,host:{}}}),{code:'INVALID_CHECKPOINT'});
    assert.throws(()=>saveCheckpoint(store,{...request,project:'unregistered'}),{code:'PROJECT_NOT_REGISTERED'});
  });
  assert.equal(observed.calls,0);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM idempotency').get().n,1);
});

test('committed replay from another handle does not wait for an unrelated SQLite writer',t=>{
  const {store,request,openPeer}=fixture(t),writer=openPeer();
  const first=saveCheckpoint(writer,request);
  store.db.exec('PRAGMA busy_timeout=0');writer.db.exec('BEGIN IMMEDIATE');
  try{
    const observed=observeGit(()=>saveCheckpoint(store,request));
    assert.deepEqual(observed.value,first);assert.equal(observed.calls,0);
  }finally{writer.db.exec('ROLLBACK');}
});

for(const conflicting of [false,true])test(`new checkpoint rechecks idempotency under the write transaction (${conflicting?'conflicting':'equal'} racing request)`,t=>{
  const {store,request,openPeer}=fixture(t),other=openPeer();
  const {snapshot}=store.project('project'),content={...request.content,snapshot};
  let raced=false,winningResponse;
  const run=()=>store.checkpoint('project','task',content,0,'race');
  const observed=observeGit(()=>{
    if(conflicting)assert.throws(run,{code:'IDEMPOTENCY_CONFLICT'});
    else assert.deepEqual(run(),winningResponse);
  },()=>{
    if(raced)return;raced=true;
    winningResponse=other.checkpoint('project','task',conflicting?{...content,nextAction:'Other request'}:content,0,'race');
  });
  assert.equal(observed.calls,2,'both first-time requests must observe the host before writing');
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM task_history').get().n,1);
  assert.equal(store.events('project').filter(event=>event.type==='checkpoint.created').length,1);
  assert.deepEqual(store.task('project','task'),winningResponse);
});


test('two processes share one committed response, task version and event for the same key',{timeout:15000},async t=>{
  const {store,home,request}=fixture(t);
  const input={...request,content:{...request.content,snapshot:store.project('project').snapshot}};
  const source=`
    import { BrainStore } from ${JSON.stringify(new URL('../src/store.mjs',import.meta.url).href)};
    import { saveCheckpoint } from ${JSON.stringify(new URL('../src/session.mjs',import.meta.url).href)};
    const store=new BrainStore(process.env.REPLAY_TEST_HOME);
    process.send('ready');
    process.once('message',()=>{
      try{process.send({response:saveCheckpoint(store,JSON.parse(process.env.REPLAY_TEST_INPUT))});}
      catch(error){process.send({error:{code:error.code,message:error.message}});process.exitCode=1;}
      finally{store.close();process.disconnect();}
    });`;
  const children=Array.from({length:2},()=>childProcess.spawn(process.execPath,['--input-type=module','-e',source],{
    env:{...process.env,REPLAY_TEST_HOME:home,REPLAY_TEST_INPUT:JSON.stringify(input)},stdio:['ignore','ignore','pipe','ipc']
  }));
  for(const child of children)t.after(()=>{if(child.exitCode===null)child.kill();});
  const exits=children.map(child=>once(child,'exit'));
  await Promise.all(children.map(async child=>assert.equal((await once(child,'message'))[0],'ready')));
  const responses=children.map(child=>once(child,'message'));children.forEach(child=>child.send('start'));
  const results=await Promise.all(responses);
  for(const [result] of results)assert.equal(result.error,undefined,JSON.stringify(result.error));
  assert.deepEqual(results[0][0].response,results[1][0].response);
  assert.deepEqual(store.task('project','task'),results[0][0].response);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM task_history').get().n,1);
  assert.equal(store.events('project').filter(event=>event.type==='checkpoint.created').length,1);
  for(const [code] of await Promise.all(exits))assert.equal(code,0);
});
