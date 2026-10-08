import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BrainStore} from '../src/store.mjs';
import {LaneStore} from '../src/lanes/store.mjs';
import {assertWorkspaceBinding,readWorkspaceOverview} from '../src/workspace.mjs';
import {indexProject} from '../src/retrieval.mjs';
import {laneFixture} from './fixtures/lane-setup.mjs';
import {laneConfig} from '../src/lanes/clients.mjs';

function fixture(t){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-workspace-')),root=path.join(temp,'project'),sibling=path.join(temp,'project-other');
  fs.mkdirSync(root);fs.mkdirSync(sibling);fs.mkdirSync(path.join(root,'src'));
  const store=new BrainStore(path.join(temp,'state'));store.register('one',root);store.register('two',sibling);
  t.after(()=>{store.close();fs.rmSync(temp,{recursive:true,force:true});});
  return {temp,root,sibling,store};
}
test('workspace binding accepts the project root and its ordinary subdirectories',t=>{
  const f=fixture(t),binding={project:'one',workspace:f.root};
  assert.deepEqual(assertWorkspaceBinding(f.store,binding,path.join(f.root,'src')),{project:'one',workspace:fs.realpathSync.native(f.root)});
});
test('workspace binding rejects a sibling prefix and another granted project',t=>{
  const f=fixture(t);
  assert.throws(()=>assertWorkspaceBinding(f.store,{project:'one',workspace:f.root},f.sibling),{code:'WORKSPACE_CWD_MISMATCH'});
  assert.throws(()=>assertWorkspaceBinding(f.store,{project:'one',workspace:f.sibling},f.root),{code:'WORKSPACE_BINDING_MISMATCH'});
});
test('workspace binding requires an existing absolute directory',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'file'),'text');
  for(const workspace of [undefined,'project',path.join(f.temp,'missing'),path.join(f.root,'file')])assert.throws(()=>assertWorkspaceBinding(f.store,{project:'one',workspace},f.root));
});
test('workspace binding resolves symlink aliases before containment checks',t=>{
  const f=fixture(t),alias=path.join(f.temp,'alias'),escape=path.join(f.root,'escape');
  fs.symlinkSync(f.root,alias,process.platform==='win32'?'junction':'dir');fs.symlinkSync(f.sibling,escape,process.platform==='win32'?'junction':'dir');
  assert.equal(assertWorkspaceBinding(f.store,{project:'one',workspace:alias},alias).workspace,fs.realpathSync.native(f.root));
  assert.throws(()=>assertWorkspaceBinding(f.store,{project:'one',workspace:f.root},escape),{code:'WORKSPACE_CWD_MISMATCH'});
});
test('workspace binding rejects a legacy child directory assigned to a different project',t=>{
  const f=fixture(t),child=path.join(f.root,'child');fs.mkdirSync(child);
  f.store.db.prepare('INSERT INTO projects(id,root,created) VALUES(?,?,?)').run('child',fs.realpathSync(child),'fixture');
  assert.throws(()=>assertWorkspaceBinding(f.store,{project:'one',workspace:f.root},child),{code:'WORKSPACE_PROJECT_CONFLICT'});
});
test('legacy project root aliases cannot evade the nested project scope refusal',t=>{
  const f=fixture(t),child=path.join(f.root,'child'),alias=path.join(f.temp,'child-alias');fs.mkdirSync(child);fs.symlinkSync(child,alias,process.platform==='win32'?'junction':'dir');
  f.store.db.prepare('INSERT INTO projects(id,root,created) VALUES(?,?,?)').run('child',alias,'fixture');
  assert.throws(()=>assertWorkspaceBinding(f.store,{project:'one',workspace:f.root},child),{code:'WORKSPACE_PROJECT_CONFLICT'});
});
test('workspace binding rejects a root replaced by a symlink',t=>{
  const f=fixture(t),moved=path.join(f.temp,'moved');fs.renameSync(f.root,moved);fs.symlinkSync(f.sibling,f.root,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>assertWorkspaceBinding(f.store,{project:'one',workspace:f.root},f.root),{code:'PROJECT_ROOT_CHANGED'});
});
test('workspace binding verifies the lane identity and active host binding',t=>{
  const f=laneFixture(t),store=new LaneStore(f.home,'product','alpha');
  try{
  const args={project:'product',workspace:f.alpha,lane:'alpha'};
  assert.equal(assertWorkspaceBinding(store,args,f.alpha).epoch,store.binding.epoch);
  assert.throws(()=>assertWorkspaceBinding(store,{...args,lane:'beta'},f.alpha),{code:'WORKSPACE_LANE_MISMATCH'});
  assert.throws(()=>assertWorkspaceBinding(store,{...args,workspace:f.beta},f.beta),{code:'WORKSPACE_BINDING_MISMATCH'});
  f.registry.retire('product','alpha',store.binding.epoch);
  assert.throws(()=>assertWorkspaceBinding(store,args,f.alpha),{code:'LANE_NOT_ACTIVE'});
  }finally{store.close();}
});
for(const client of ['kilo','antigravity'])test(client+' lane fragment is workspace-bound and does not change tool approvals',()=>{
  const base=path.resolve(os.tmpdir()),binding={project:'product',id:'alpha',root:path.join(base,'workspace')};
  const config=laneConfig(client,{node:process.execPath,entry:path.join(base,'lanes.mjs'),home:path.join(base,'state'),binding});
  const entry=client==='kilo'?config.fragment.mcp[config.serverName]:config.fragment.mcpServers[config.serverName];
  const args=client==='kilo'?entry.command.slice(1):entry.args;
  assert.deepEqual(args.slice(-6),['--project','product','--lane','alpha','--workspace',binding.root]);
  assert.equal(config.destination,client==='kilo'?'.kilo/kilo.json':'.agents/mcp_config.json');
  if(client==='kilo'){assert.equal(entry.timeout,60000);assert.equal(entry.type,'local');}
  assert.equal(config.writesConfiguration,false);assert.equal(config.clientVersionVerified,null);
  assert.equal(entry.alwaysAllow,undefined);assert.equal(config.fragment.permission,undefined);
});
test('project registration refuses overlapping roots while preserving idempotency and siblings',t=>{
  const f=fixture(t),child=path.join(f.root,'child');fs.mkdirSync(child);
  assert.equal(f.store.register('one',f.root).root,fs.realpathSync.native(f.root));
  assert.equal(f.store.register('two',f.sibling).id,'two');
  assert.throws(()=>f.store.register('child',child),{code:'PROJECT_ROOT_OVERLAP'});
  assert.throws(()=>f.store.register('parent',f.temp),{code:'PROJECT_ROOT_OVERLAP'});
  assert.equal(f.store.projects().length,2);
});
test('legacy canonical aliases preserve registration identity and cannot duplicate or overlap it',t=>{
  const f=fixture(t),legacy=fs.realpathSync(f.root),actual=fs.realpathSync.native(f.root),child=path.join(f.root,'child');fs.mkdirSync(child);
  f.store.db.prepare('UPDATE projects SET root=? WHERE id=?').run(legacy,'one');
  assert.equal(f.store.register('one',actual).id,'one');assert.equal(f.store.project('one').root,legacy);
  assert.throws(()=>f.store.register('duplicate',actual),{code:'PROJECT_ROOT_ALREADY_REGISTERED'});
  assert.throws(()=>f.store.register('child',child),{code:'PROJECT_ROOT_OVERLAP'});
  assert.equal(f.store.projects().length,2);
});
test('workspace overview does not initialize missing registry or lane databases',t=>{
  const f=fixture(t),before=fs.readdirSync(f.store.home).sort();
  assert.equal(readWorkspaceOverview(f.store,'one').registry.state,'absent');
  assert.deepEqual(fs.readdirSync(f.store.home).sort(),before);
  assert.throws(()=>readWorkspaceOverview(f.store,'foreign'),{code:'PROJECT_NOT_REGISTERED'});
  const lanes=laneFixture(t),overview=readWorkspaceOverview(lanes.authority,'product');
  assert.equal(overview.lanes.length,2);assert(overview.lanes.every(lane=>lane.storage==='not_initialized'));
  assert(!fs.existsSync(path.join(lanes.home,'lanes')));
});
test('workspace overview preserves lane task identity and reads closed workspace checkpoints',t=>{
  const f=laneFixture(t);
  for(const lane of ['alpha','beta']){
    const store=new LaneStore(f.home,'product',lane);
    try{indexProject(store,'product');store.checkpoint('product','TASK',{objective:lane,nextAction:'Review',status:'paused'},0,'same-key');}finally{store.close();}
  }
  f.registry.retire('product','alpha',f.registry.active('product','alpha').epoch);fs.rmSync(f.alpha,{recursive:true,force:true});
  const overview=readWorkspaceOverview(f.authority,'product');
  assert.equal(overview.primary.tasks.length,0);
  assert.deepEqual(overview.lanes.map(lane=>lane.tasks[0].content.objective).sort(),['alpha','beta']);
  assert.equal(overview.lanes.find(lane=>lane.id==='alpha').state,'closed');
  assert(overview.lanes.every(lane=>lane.storage==='available'&&lane.tasks[0].version===1&&lane.snapshot));
});
test('workspace overview fails closed for a corrupt lane but keeps other lane metadata',t=>{
  const f=laneFixture(t),store=new LaneStore(f.home,'product','alpha');
  store.db.prepare("UPDATE meta SET value='corrupt' WHERE key='schema'").run();store.close();
  const overview=readWorkspaceOverview(f.authority,'product'),alpha=overview.lanes.find(lane=>lane.id==='alpha');
  assert.equal(alpha.storage,'error');assert.equal(alpha.error,'WORKSPACE_SCHEMA_HASH');assert.deepEqual(alpha.tasks,[]);
  assert.equal(overview.lanes.find(lane=>lane.id==='beta').storage,'not_initialized');
});
test('workspace overview refuses a lane database bound to another root',t=>{
  const f=laneFixture(t),store=new LaneStore(f.home,'product','alpha');
  store.db.prepare('UPDATE projects SET root=? WHERE id=?').run(f.beta,'product');store.close();
  assert.equal(readWorkspaceOverview(f.authority,'product').lanes.find(lane=>lane.id==='alpha').error,'WORKSPACE_DB_SCOPE_CONFLICT');
});
test('workspace overview refuses registry metadata from another schema',t=>{
  const f=laneFixture(t);f.registry.db.exec('PRAGMA user_version=99');
  const overview=readWorkspaceOverview(f.authority,'product');
  assert.deepEqual(overview.registry,{state:'error',error:'WORKSPACE_SCHEMA_VERSION'});assert.deepEqual(overview.lanes,[]);
});
test('workspace overview bounds lane and task counts and reports truncation',t=>{
  const f=laneFixture(t),content=JSON.stringify({objective:'Task',nextAction:'Review',status:'paused'});
  for(let i=0;i<21;i++)f.authority.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?)').run('product','T'+i,1,content,'2026-10-08');
  for(let i=0;i<34;i++)f.registry.db.prepare('INSERT INTO lanes VALUES(?,?,?,?,?,?,?)').run('product','closed'+i,path.join(f.root,'closed'+i),'common','epoch'+i,'closed','2026-10-08');
  const overview=readWorkspaceOverview(f.authority,'product');
  assert.equal(overview.primary.tasks.length,20);assert.equal(overview.lanes.length,32);assert.equal(overview.truncated,true);
  for(let i=0;i<15;i++)f.registry.db.prepare('INSERT INTO lanes VALUES(?,?,?,?,?,?,?)').run('product','active'+i,path.join(f.root,'active'+i),'common','epoch'+i,'active','2026-10-08');
  assert.equal(readWorkspaceOverview(f.authority,'product').registry.error,'WORKSPACE_ACTIVE_LANE_LIMIT');
});
test('workspace overview does not return oversized checkpoint contents',t=>{
  const f=fixture(t);f.store.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?)').run('one','TASK',1,'x'.repeat(20000),'2026-10-08');
  const overview=readWorkspaceOverview(f.store,'one');assert.equal(overview.primary.error,'INVALID_WORKSPACE_CHECKPOINT');assert.deepEqual(overview.primary.tasks,[]);
});
test('workspace overview rejects a lane database symlink and stays project-scoped',t=>{
  const f=laneFixture(t),foreign=path.join(f.root,'foreign');fs.mkdirSync(foreign);f.authority.register('foreign',foreign);
  f.authority.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?)').run('foreign','PRIVATE',1,JSON.stringify({objective:'FOREIGN_SECRET',nextAction:'Review',status:'paused'}),'2026-10-08');
  const laneRoot=f.registry.stateDirectory('product','alpha');fs.mkdirSync(laneRoot,{recursive:true});
  fs.symlinkSync(path.join(f.authority.home,'brain.sqlite'),path.join(laneRoot,'brain.sqlite'),'file');
  const overview=readWorkspaceOverview(f.authority,'product');
  assert.equal(overview.lanes.find(lane=>lane.id==='alpha').error,'UNSAFE_WORKSPACE_DB');
  assert(!JSON.stringify(overview).includes('FOREIGN_SECRET'));
});
