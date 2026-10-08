import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const entry=fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url));
function fixture(t){
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-cli-control-'))),root=path.join(dir,'alpha'),foreign=path.join(dir,'beta'),home=path.join(dir,'state');
  fs.mkdirSync(root);fs.mkdirSync(foreign);fs.writeFileSync(path.join(root,'README.md'),'# Alpha project\n');
  const clients=[];t.after(async()=>{for(const client of clients)await client.close();fs.rmSync(dir,{recursive:true,force:true});});
  const env={...process.env,BBRAINX_HOME:home,BBRAINX_ENTRY:entry};
  const run=(args,cwd=root)=>{const child=spawnSync(process.execPath,[entry,...args],{cwd,env,encoding:'utf8',timeout:20000});assert.equal(child.status,0,child.stderr);return JSON.parse(child.stdout);};
  return {dir,root,foreign,home,env,run,clients};
}
test('CLI previews without creating state, applies idempotently and rolls configuration back',t=>{
  const f=fixture(t),args=['integrate','--root',f.root,'--project','alpha','--clients','codex'];
  const plan=f.run(args);assert.ok(plan.files.length);assert.equal(fs.existsSync(f.home),false);assert.equal(fs.existsSync(path.join(f.root,'.codex')),false);
  const first=f.run([...args,'--apply']),content=fs.readFileSync(path.join(f.root,'.codex','config.toml'),'utf8');
  assert.match(content,/--workspace/);assert.match(content,/--harness/);
  f.run([...args,'--apply']);assert.equal(fs.readFileSync(path.join(f.root,'.codex','config.toml'),'utf8'),content);
  f.run(['integrations','rollback','--id',first.receipt.id]);assert.equal(fs.existsSync(path.join(f.root,'.codex','config.toml')),false);
});
test('two real MCP clients share one checkpoint and refuse foreign project and foreign startup cwd',async t=>{
  const f=fixture(t);f.run(['up','--root',f.root,'--project','alpha']);f.run(['init','--root',f.foreign,'--project','beta']);
  const clients=f.clients;
  async function connect(harness){const client=new Client({name:harness,version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[entry,'mcp','--project','alpha','--workspace',f.root,'--harness',harness],cwd:f.root,env:f.env,stderr:'pipe'});transport.stderr?.on('data',()=>{});clients.push(client);await client.connect(transport);return client;}
  const codex=await connect('codex'),claude=await connect('claude');
  const saved=await codex.callTool({name:'session_checkpoint',arguments:{project:'alpha',task:'feature',expectedVersion:0,idempotencyKey:'first',content:{objective:'Shared only inside alpha',nextAction:'Review implementation',status:'review_needed'}}});assert.equal(saved.structuredContent.ok,true);
  const read=await claude.callTool({name:'session_get',arguments:{project:'alpha',task:'feature'}});assert.equal(read.structuredContent.data.checkpoint.content.objective,'Shared only inside alpha');
  const denied=await claude.callTool({name:'session_get',arguments:{project:'beta',task:'feature'}});assert.equal(denied.isError,true);
  const overview=f.run(['control','--project','alpha']);assert.deepEqual(overview.activity.map(x=>x.harness).sort(),['claude','codex']);assert.ok(overview.activity.every(x=>x.status==='connected'));
  const wrong=spawnSync(process.execPath,[entry,'mcp','--project','alpha','--workspace',f.root,'--harness','codex'],{cwd:f.foreign,env:f.env,encoding:'utf8',timeout:10000});assert.equal(wrong.status,1);assert.match(wrong.stderr,/WORKSPACE/);
});
test('explicit CLI test records real results while budget remains advisory and costs unknown',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'example.test.mjs'),"import {test} from 'node:test';import assert from 'node:assert/strict';test('real arithmetic',()=>assert.equal(2+2,4));\n");
  f.run(['up','--root',f.root,'--project','alpha']);const result=f.run(['test','--project','alpha','--file','example.test.mjs']);assert.equal(result.status,'passed');assert.equal(result.passed,1);
  f.run(['budget','--project','alpha','--amount','10','--currency','USD','--basis','reported','--version','0']);
  const overview=f.run(['control','--project','alpha']);assert.equal(overview.runs[0].id,result.id);assert.equal(overview.budget.status,'unknown');
});

test('observation preserves unusual failures from real engine invocation options',async t=>{
  const f=fixture(t);f.run(['init','--root',f.root,'--project','alpha']);
  const {BrainStore}=await import('../src/store.mjs'),{makeEngine}=await import('../src/engine.mjs'),{observeEngine}=await import('../src/control.mjs');
  const brain=new BrainStore(f.home),observed=observeEngine(makeEngine(brain,['alpha']),brain,{project:'alpha',harness:'codex',workspace:f.root});
  try{for(const original of [null,undefined,Object.defineProperty({},'code',{get(){throw new Error('getter failed');}})]){
    const options=Object.defineProperty({},'principal',{get(){throw original;}});
    await assert.rejects(observed.engine.invoke('session.get',{project:'alpha',task:'T1'},options),error=>error===original);
  }}finally{observed.close();brain.close();}
});
