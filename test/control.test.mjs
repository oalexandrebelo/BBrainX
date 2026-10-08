import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BrainStore} from '../src/store.mjs';
import {makeEngine} from '../src/engine.mjs';
import {hash} from '../src/primitives.mjs';
import {observeEngine,controlOverview,workspaceSeen,discoverOpenWorkspaces,saveTestRun,archiveTestRun} from '../src/control.mjs';
import {createMcpHandler} from '../src/mcp.mjs';
import {serverBrand} from '../src/brand.mjs';
import {laneFixture} from './fixtures/lane-setup.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

function stderrError(stderr,expected){
 const line=stderr.split(/\r?\n/).find(line=>{
  try{return JSON.parse(line)?.error===expected;}catch{return false;}
 });
 assert.ok(line,`Expected ${expected} JSON error in stderr; received:\n${stderr}`);
 return JSON.parse(line);
}

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-control-')),brain=new BrainStore(path.join(root,'state'));
 for(const id of ['alpha','beta']){fs.mkdirSync(path.join(root,id));fs.writeFileSync(path.join(root,id,'README.md'),'# '+id);brain.register(id,path.join(root,id));}
 t.after(()=>{brain.close();fs.rmSync(root,{recursive:true,force:true});});return {brain,root};}

test('control read is project-scoped, leaves missing observation storage absent and unknown costs unknown',t=>{
 const {brain}=fixture(t);const result=controlOverview(brain,'alpha');assert.equal(result.project.id,'alpha');assert.deepEqual(result.activity,[]);assert.deepEqual(result.runs,[]);
 assert.equal(result.usage.usage.tokens.totalTokens.value,null);assert.equal(fs.existsSync(path.join(brain.home,'control-v1')),false);
 assert.throws(()=>controlOverview(brain,'foreign'),{code:'PROJECT_NOT_REGISTERED'});
});
test('real engine observation records bounded metadata, domain refusals and lifecycle without arguments',async t=>{
 const {brain,root}=fixture(t), observer=observeEngine(makeEngine(brain,['alpha']),brain,{project:'alpha',harness:'codex',workspace:path.join(root,'alpha')});t.after(()=>observer.close());
 assert.equal(controlOverview(brain,'alpha').activity[0].status,'starting');
 await observer.engine.invoke('session.get',{project:'alpha',task:'super-secret-value'},{principal:{id:'test'}});
 await assert.rejects(observer.engine.invoke('session.get',{project:'beta',task:'x'},{principal:{id:'test'}}),{code:'FORBIDDEN'});
 let report=controlOverview(brain,'alpha');assert.equal(report.activity[0].calls,2);assert.equal(report.activity[0].failures,1);assert.equal(report.activity[0].lastError,'FORBIDDEN');assert.ok(!JSON.stringify(report.activity).includes('super-secret-value'));
 assert.deepEqual(controlOverview(brain,'beta').activity,[]);observer.close();assert.equal(controlOverview(brain,'alpha').activity[0].status,'closed');
});
test('MCP handshake advertises original brand and marks the connection only when observed',async t=>{
 const {brain,root}=fixture(t),observer=observeEngine(makeEngine(brain,['alpha']),brain,{project:'alpha',harness:'claude',workspace:path.join(root,'alpha')});t.after(()=>observer.close());
 const handler=createMcpHandler(observer.engine,{principal:{id:'host'},serverMetadata:serverBrand('alpha'),onConnect:()=>observer.connected()});
 const response=await handler.handle({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'official-test',version:'1'}}});
 assert.equal(response.result.serverInfo.name,'bbrainx');assert.equal(response.result.serverInfo.title,'BBrainX · alpha');assert.match(response.result.serverInfo.icons[0].src,/^data:image\/svg\+xml;base64,/);
 assert.equal(controlOverview(brain,'alpha').activity[0].status,'connected');
});
test('stale process metadata is not displayed as connected and malformed records are counted',t=>{
 const {brain,root}=fixture(t),observer=observeEngine(makeEngine(brain,['alpha']),brain,{project:'alpha',harness:'codex',workspace:path.join(root,'alpha'),clock:()=>Date.now()-120000});t.after(()=>observer.close());observer.connected();
 assert.equal(controlOverview(brain,'alpha').activity[0].status,'stale');
 const dir=path.join(brain.home,'control-v1',hash('alpha').slice(0,32),'sessions');fs.writeFileSync(path.join(dir,'corrupt.json'),'not json');assert.equal(controlOverview(brain,'alpha').coverage.invalidRecords,1);
});
test('editor discovery reports open versus stale folders and never registers or indexes a project',t=>{
 const {brain,root}=fixture(t);const row=workspaceSeen(brain.home,{root:path.join(root,'alpha'),harness:'vscode',session:'test-session'});
 assert.equal(discoverOpenWorkspaces(brain.home).items[0].status,'open');assert.equal(discoverOpenWorkspaces(brain.home,{now:Date.parse(row.lastSeen)+91000}).items[0].status,'stale');assert.equal(brain.projects().length,2);
 assert.throws(()=>workspaceSeen(brain.home,{root:'relative',harness:'vscode',session:'x'}),{code:'ABSOLUTE_WORKSPACE_REQUIRED'});
 assert.throws(()=>workspaceSeen(brain.home,{root,harness:'random',session:'x'}),{code:'UNKNOWN_EDITOR'});
});
test('control open workspace receipts exclude other projects and retain this project lanes',t=>{
 const f=laneFixture(t),foreign=path.join(f.root,'foreign');fs.mkdirSync(foreign);f.authority.register('foreign',foreign);
 const receipt=(root,session)=>workspaceSeen(f.home,{root,harness:'vscode',session});
 receipt(f.primary,'primary-open');receipt(f.alpha,'lane-open');receipt(foreign,'FOREIGN_SESSION_PRIVATE');
 assert.equal(discoverOpenWorkspaces(f.home).items.length,3);
 const product=controlOverview(f.authority,'product'),other=controlOverview(f.authority,'foreign');
 assert.deepEqual(product.openWorkspaces.items.map(x=>x.workspace).sort(),[fs.realpathSync.native(f.primary),fs.realpathSync.native(f.alpha)].sort());
 assert.deepEqual(other.openWorkspaces.items.map(x=>x.workspace),[fs.realpathSync.native(foreign)]);
 assert(!JSON.stringify(product.openWorkspaces).includes('FOREIGN_SESSION_PRIVATE'));assert(!JSON.stringify(product.openWorkspaces).includes(foreign));
 assert(!JSON.stringify(other.openWorkspaces).includes('lane-open'));assert(!fs.existsSync(path.join(f.home,'lanes')));
});
test('legacy editor root spelling matches OS identity while redirected receipts remain excluded',t=>{
 const f=laneFixture(t),receipt=workspaceSeen(f.home,{root:f.alpha,harness:'vscode',session:'legacy-spelling'}),file=path.join(f.home,'control-v1','editors',receipt.id+'.json');
 const value=JSON.parse(fs.readFileSync(file,'utf8')),legacy=fs.realpathSync(path.join(os.tmpdir(),path.basename(f.root),'alpha feature'));
 fs.writeFileSync(file,JSON.stringify({...value,workspace:legacy}));
 assert.equal(controlOverview(f.authority,'product').openWorkspaces.items[0].workspace,fs.realpathSync.native(f.alpha));
 const alias=path.join(f.root,'redirected receipt');fs.symlinkSync(f.alpha,alias,process.platform==='win32'?'junction':'dir');
 fs.writeFileSync(file,JSON.stringify({...value,workspace:alias}));assert.equal(controlOverview(f.authority,'product').openWorkspaces.items.length,0);
});
test('integrate lane CLI plan verifies registered binding without creating its workspace database',t=>{
 const f=laneFixture(t),entry=fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url)),env={...process.env,BBRAINX_HOME:f.home};
 const plan=spawnSync(process.execPath,[entry,'integrate','--root',f.alpha,'--project','product','--lane','alpha','--clients','claude'],{encoding:'utf8',cwd:f.alpha,env,timeout:10000});
 assert.equal(plan.status,0,plan.stderr);assert.equal(JSON.parse(plan.stdout).lane,'alpha');
 assert(!fs.existsSync(path.join(f.home,'lanes')));assert(!fs.existsSync(path.join(f.alpha,'.mcp.json')));assert.equal(f.authority.projects().length,1);
 const wrong=spawnSync(process.execPath,[entry,'integrate','--root',f.beta,'--project','product','--lane','alpha','--clients','claude'],{encoding:'utf8',cwd:f.beta,env,timeout:10000});
 assert.equal(wrong.status,1);assert.equal(stderrError(wrong.stderr,'WORKSPACE_BINDING_MISMATCH').error,'WORKSPACE_BINDING_MISMATCH');assert(!fs.existsSync(path.join(f.home,'lanes')));
 f.registry.retire('product','alpha',f.registry.active('product','alpha').epoch);
 const closed=spawnSync(process.execPath,[entry,'integrate','--root',f.alpha,'--project','product','--lane','alpha','--clients','claude'],{encoding:'utf8',cwd:f.alpha,env,timeout:10000});
 assert.equal(closed.status,1);assert.equal(stderrError(closed.stderr,'LANE_NOT_ACTIVE').error,'LANE_NOT_ACTIVE');assert(!fs.existsSync(path.join(f.home,'lanes')));
});
test('legacy lanes MCP advertises BBrainX and records the real lane connection',async t=>{
 const f=laneFixture(t),entry=fileURLToPath(new URL('../scripts/lanes.mjs',import.meta.url)),client=new Client({name:'control-lane-test',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[entry,'mcp','--project','product','--lane','alpha','--workspace',f.alpha,'--harness','codex'],cwd:f.alpha,env:{...process.env,BBRAINX_HOME:f.home},stderr:'pipe'});transport.stderr?.on('data',()=>{});
 try{
  await client.connect(transport);assert.equal(client.getServerVersion().name,'bbrainx');assert.equal(client.getServerVersion().title,'BBrainX · product');assert.match(client.getServerVersion().icons[0].src,/^data:image\/svg\+xml;base64,/);
  await client.callTool({name:'session_get',arguments:{project:'product',task:'continuation'}});
  const observed=controlOverview(f.authority,'product').activity.find(x=>x.lane==='alpha');assert.equal(observed.harness,'codex');assert.equal(observed.workspace,fs.realpathSync.native(f.alpha));assert.equal(observed.status,'connected');assert.equal(observed.calls,1);
 }finally{await client.close();await transport.close();}
 assert.equal(controlOverview(f.authority,'product').activity.find(x=>x.lane==='alpha').status,'closed');
});
test('test records stay in the host project and reads reject symlink storage',t=>{
 const {brain,root}=fixture(t);const run={id:'test-run',project:'alpha',task:'T1',status:'passed',startedAt:new Date().toISOString(),completed:1,total:1,passed:1,failed:0};saveTestRun(brain,'alpha',run);
 assert.equal(controlOverview(brain,'alpha').runs[0].passed,1);assert.deepEqual(controlOverview(brain,'beta').runs,[]);
 assert.throws(()=>saveTestRun(brain,'beta',run),{code:'INVALID_TEST_RUN'});
 const beta=path.join(brain.home,'control-v1',hash('beta').slice(0,32));fs.symlinkSync(path.join(root,'alpha'),beta,process.platform==='win32'?'junction':'dir');assert.throws(()=>controlOverview(brain,'beta'),{code:'UNSAFE_CONTROL_PATH'});
});
test('unavailable optional observation does not change real engine results',async t=>{
 const {brain,root}=fixture(t);fs.writeFileSync(path.join(brain.home,'control-v1'),'not a directory');
 const observer=observeEngine(makeEngine(brain,['alpha']),brain,{project:'alpha',harness:'codex',workspace:path.join(root,'alpha')});
 assert.equal(observer.recordingError,'UNSAFE_CONTROL_PATH');
 const result=await observer.engine.invoke('session.get',{project:'alpha',task:'x'},{principal:{id:'host'}});assert.equal(result.ok,true);observer.connected();observer.close();
});
test('terminal test history is archived recoverably at the active window limit and never resurrected',t=>{
 const {brain}=fixture(t);let oldest;
 for(let i=0;i<129;i++){const record={id:'run-'+i,project:'alpha',status:'passed',startedAt:new Date(1000+i*1000).toISOString(),failures:[]};if(i===0)oldest=record;saveTestRun(brain,'alpha',record);}
 const archive=path.join(brain.home,'control-v1',hash('alpha').slice(0,32),'run-archive','run-0.json');
 assert.equal(JSON.parse(fs.readFileSync(archive)).id,'run-0');assert.equal(controlOverview(brain,'alpha').runs.length,50);assert.equal(saveTestRun(brain,'alpha',oldest).archived,true);
 assert.throws(()=>saveTestRun(brain,'alpha',{...oldest,status:'failed'}),{code:'CONTROL_RUN_ARCHIVED'});
 saveTestRun(brain,'alpha',{id:'running',project:'alpha',status:'running',startedAt:new Date().toISOString()});assert.throws(()=>archiveTestRun(brain,'alpha','running'),{code:'TEST_RUN_NOT_TERMINAL'});
});
