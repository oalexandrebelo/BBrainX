import { test } from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BrainStore } from '../src/store.mjs';import { indexProject } from '../src/retrieval.mjs';

test('real MCP stdio: two independently started clients share a durable checkpoint',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-mcp-')),root=path.join(home,'repo');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'README.md'),'Authentication: keep the public contract.');
 const store=new BrainStore(path.join(home,'state'));store.register('test',root);const {snapshot}=indexProject(store,'test');store.close();
 async function connect(name){const client=new Client({name,version:'1.0'});const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url)),'mcp','--project','test'],env:{...process.env,BBRAINX_HOME:path.join(home,'state')},stderr:'pipe'});transport.stderr?.on('data',()=>{});await client.connect(transport);return client;}
 let first,second;
 try{
  first=await connect('harness-A');const {tools}=await first.listTools();assert.equal(tools.length,6);assert.ok(tools.some(x=>x.name==='session_checkpoint'));
  const write=await first.callTool({name:'session_checkpoint',arguments:{project:'test',task:'T1',expectedVersion:0,idempotencyKey:'first',content:{objective:'Preserve authentication',nextAction:'Review implementation',snapshot,status:'review_needed'}}});assert.equal(write.structuredContent.ok,true);await first.close();first=null;
  second=await connect('harness-B');const read=await second.callTool({name:'session_get',arguments:{project:'test',task:'T1'}});assert.equal(read.structuredContent.data.checkpoint.version,1);assert.equal(read.structuredContent.data.checkpoint.content.nextAction,'Review implementation');
  const denied=await second.callTool({name:'session_get',arguments:{project:'forbidden',task:'T1'}});assert.equal(denied.isError,true);
 }finally{await first?.close();await second?.close();fs.rmSync(home,{recursive:true,force:true});}
});
