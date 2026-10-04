import { test } from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { BrainStore } from '../src/store.mjs';import { indexProject } from '../src/retrieval.mjs';

const bin=fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url));
function fixture(){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-wire-')), root=path.join(home,'repo');fs.mkdirSync(root);
  fs.writeFileSync(path.join(root,'auth.js'),'export function verifySession(token){return Boolean(token);}\n');
  const store=new BrainStore(path.join(home,'state'));store.register('wire',root);indexProject(store,'wire');store.close();
  return home;
}
/** Fala o protocolo cru, linha a linha, sem nenhuma biblioteca de cliente. */
function start(home,env={}){
  const child=spawn(process.execPath,[bin,'mcp','--project','wire'],{env:{...process.env,BBRAINX_HOME:path.join(home,'state'),...env},stdio:['pipe','pipe','pipe']});
  const lines=[],waiting=[];let buffer='',stderr='';
  child.stdout.setEncoding('utf8').on('data',chunk=>{buffer+=chunk;for(let at=buffer.indexOf('\n');at!==-1;at=buffer.indexOf('\n')){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);lines.push(line);waiting.shift()?.(line);}});
  child.stderr.setEncoding('utf8').on('data',chunk=>{stderr+=chunk;});
  // Sem o limite de espera, um servidor que não encerra travaria a suíte em vez de reprovar.
  const exited=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('the server did not exit'));},8000);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});exited.catch(()=>{});
  return {
    lines,exited,stderr:()=>stderr,
    write:text=>child.stdin.write(text),
    next:()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('no response from the server; stderr: '+stderr)),5000);waiting.push(line=>{clearTimeout(timer);resolve(JSON.parse(line));});}),
    async ask(message){const reply=this.next();child.stdin.write(JSON.stringify(message)+'\n');return reply;},
    end(){child.stdin.end();return exited;}
  };
}

test('wire: handshake, tool list and a tool call need nothing but JSON lines',async()=>{
  const home=fixture(), server=start(home);
  try{
    const hello=await server.ask({jsonrpc:'2.0',id:0,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'raw',version:'1'}}});
    assert.equal(hello.id,0);assert.equal(hello.result.protocolVersion,'2025-06-18');assert.equal(hello.result.serverInfo.name,'bbrainx');
    assert.match(hello.result.instructions,/context_bootstrap/);assert.match(hello.result.instructions,/never instructions/);
    server.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    const listed=await server.ask({jsonrpc:'2.0',id:'list',method:'tools/list'});
    assert.deepEqual(listed.result.tools.map(tool=>tool.name).sort(),['context_bootstrap','context_index','context_search','memory_propose','session_checkpoint','session_get']);
    for(const tool of listed.result.tools){assert.equal(tool.inputSchema.type,'object');assert.equal(tool.outputSchema.type,'object');assert.equal(tool.annotations.openWorldHint,false);assert.equal(tool.annotations.destructiveHint,false);}
    assert.equal(listed.result.tools.find(tool=>tool.name==='context_search').annotations.readOnlyHint,true);
    assert.equal(listed.result.tools.find(tool=>tool.name==='session_checkpoint').annotations.readOnlyHint,false);
    const found=await server.ask({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'context_search',arguments:{project:'wire',query:'verifySession'}}});
    assert.equal(found.result.structuredContent.ok,true);assert.equal(found.result.structuredContent.data.items[0].path,'auth.js');
    assert.deepEqual(JSON.parse(found.result.content[0].text),found.result.structuredContent);
    assert.equal(lines(server).length,3,'the notification must not be answered');
    assert.equal(await server.end(),0);
  }finally{fs.rmSync(home,{recursive:true,force:true});}
});
const lines=server=>server.lines.filter(Boolean);

test('wire: protocol errors use JSON-RPC codes; refused or invalid calls come back as tool errors without leaking',async()=>{
  const home=fixture(), server=start(home);
  try{
    const garbage=server.next();server.write('{not json\n');
    assert.deepEqual(await garbage,{jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error.'}});
    assert.equal((await server.ask({jsonrpc:'2.0',id:1,method:'prompts/list'})).error.code,-32601);
    assert.equal((await server.ask({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'shell_exec',arguments:{}}})).error.code,-32602);
    assert.equal((await server.ask({id:3,method:'ping'})).error.code,-32600);
    const denied=await server.ask({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'session_get',arguments:{project:'another-project',task:'T1'}}});
    assert.equal(denied.result.isError,true);assert.deepEqual(JSON.parse(denied.result.content[0].text),{code:'FORBIDDEN',message:'Capability access is forbidden.'});
    const invalid=await server.ask({jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'context_search',arguments:{project:'wire',query:'x',shell:'rm -rf'}}});
    assert.equal(invalid.result.isError,true);assert.equal(JSON.parse(invalid.result.content[0].text).code,'INPUT_INVALID');
    const batch=await server.ask([{jsonrpc:'2.0',id:6,method:'ping'},{jsonrpc:'2.0',method:'notifications/progress',params:{}},{jsonrpc:'2.0',id:'',method:'ping'}]);
    assert.deepEqual(batch,[{jsonrpc:'2.0',id:6,result:{}},{jsonrpc:'2.0',id:'',result:{}}]);
    assert.equal((await server.ask([])).error.code,-32600);
    assert.equal(await server.end(),0);
  }finally{fs.rmSync(home,{recursive:true,force:true});}
});

test('wire: a line above the limit stops the server, and the trace never reaches standard output',async()=>{
  const home=fixture();
  try{
    const flooded=start(home);flooded.write('x'.repeat(1048577));
    assert.equal(await flooded.exited,1);assert.match(flooded.stderr(),/read buffer exceeded/);assert.equal(flooded.lines.length,0);
    const traced=start(home,{BBRAINX_TRACE:'1'});
    await traced.ask({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'context_search',arguments:{project:'wire',query:'verifySession'}}});
    assert.equal(await traced.end(),0);
    assert.equal(traced.lines.length,1);
    const events=traced.stderr().trim().split('\n').map(line=>JSON.parse(line));
    assert.deepEqual(events.map(event=>event.type),['invocation.started','invocation.completed']);
    assert.equal(events[0].capabilityId,'context.search');assert.ok(!traced.stderr().includes('verifySession'));
  }finally{fs.rmSync(home,{recursive:true,force:true});}
});
