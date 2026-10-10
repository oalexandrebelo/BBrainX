import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {BrainStore} from '../src/store.mjs';
import {makeEngine} from '../src/engine.mjs';
import {toolCatalog} from '../src/mcp.mjs';
import {alignSdd} from '../src/sdd.mjs';
import {startServer} from '../src/server.mjs';

const entry=fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url));
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-sdd-integration-')),home=path.join(dir,'state'),root=path.join(dir,'project'),other=path.join(dir,'other');fs.mkdirSync(root);fs.mkdirSync(other);
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'sdd-integration',scripts:{test:'node --test'}}));
  const store=new BrainStore(home);store.register('a',root);store.register('b',other);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {store,root,other,home};
}
test('SDD grants precede inspection/creation and opt-in preserves default MCP catalog',async t=>{
  const {store,root,other}=fixture(t),plain=makeEngine(store,['a']),engine=makeEngine(store,['a'],{sdd:alignSdd}),context={principal:{id:'host'}};
  assert.equal(toolCatalog(plain).tools.length,6);assert.equal(toolCatalog(engine).tools.length,7);
  await assert.rejects(engine.invoke('sdd.align',{project:'b',mode:'ensure'},context),e=>e.code==='FORBIDDEN');
  await assert.rejects(engine.invoke('sdd.align',{project:'a',mode:'execute'},context),e=>e.code==='INPUT_INVALID');
  assert.equal(fs.existsSync(path.join(other,'SDD.md')),false);assert.equal(fs.existsSync(path.join(root,'SDD.md')),false);
  const result=await engine.invoke('sdd.align',{project:'a'},context);assert.equal(result.data.status,'absent');assert.equal(result.data.created,false);
});
test('HTTP assess is read-only and explicit ensure creates a draft without replacing it',async t=>{
  const {store,root}=fixture(t),server=await startServer(store,{port:0});
  try{
    const boot=await(await fetch(server.url+'/api/bootstrap')).json();
    const call=async(mode,csrf=boot.csrf)=>await(await fetch(server.url+'/api/invoke',{method:'POST',headers:{'content-type':'application/json','x-bbrainx-csrf':csrf},body:JSON.stringify({action:'sdd.align',args:{project:'a',mode}})})).json();
    assert.equal((await call('assess')).data.status,'absent');assert.equal(fs.existsSync(path.join(root,'SDD.md')),false);
    assert.ok((await call('ensure','invalid')).error);assert.equal(fs.existsSync(path.join(root,'SDD.md')),false);
    const result=await call('ensure');assert.equal(result.ok,true);assert.equal(result.data.created,true);assert.equal(result.data.status,'draft');assert.equal(result.data.semanticQuality,'not_assessed');
    const before=fs.readFileSync(path.join(root,'SDD.md'));assert.equal((await call('ensure')).data.created,false);assert.deepEqual(fs.readFileSync(path.join(root,'SDD.md')),before);
  }finally{await server.close();}
});
test('CLI default ensure creates once and MCP opt-in enforces project scope with real transport',async t=>{
  const {store,root,other,home}=fixture(t),env={...process.env,BBRAINX_HOME:home};
  const cli=spawnSync(process.execPath,[entry,'sdd','--project','a','--mode','assess'],{env,encoding:'utf8',timeout:10000});assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).data.status,'absent');assert.equal(fs.existsSync(path.join(root,'SDD.md')),false);
  const created=spawnSync(process.execPath,[entry,'sdd','--project','a'],{env,encoding:'utf8',timeout:10000});assert.equal(created.status,0,created.stderr);assert.equal(JSON.parse(created.stdout).data.created,true);
  const transport=new StdioClientTransport({command:process.execPath,args:[entry,'mcp','--project','a','--sdd'],env,stderr:'pipe'}),client=new Client({name:'sdd-contract',version:'1.0.0'});
  try{
    await client.connect(transport);const tools=(await client.listTools()).tools;assert.equal(tools.length,7);assert.ok(tools.some(tool=>tool.name==='sdd_align'));
    const result=await client.callTool({name:'sdd_align',arguments:{project:'a',mode:'ensure'}});const output=result.structuredContent||JSON.parse(result.content.find(item=>item.type==='text').text);assert.equal(output.ok,true);assert.equal(output.data.created,false);assert.equal(output.data.status,'draft');
    const denied=await client.callTool({name:'sdd_align',arguments:{project:'b',mode:'ensure'}});assert.equal(denied.isError,true);assert.equal(fs.existsSync(path.join(other,'SDD.md')),false);
  }finally{await client.close();await transport.close();}
  assert.equal(store.memories('a').length,0);assert.equal(store.tasks('a').length,0);
});
