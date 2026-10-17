import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Writable} from 'node:stream';
import {BrainStore} from '../src/store.mjs';
import {saveRecruit,recruitDirectory} from '../src/control.mjs';
import {makeEngine} from '../src/engine.mjs';
import {createMcpHandler,MODERN_VERSIONS} from '../src/mcp.mjs';
import {McpOutputQueue} from '../src/mcp-flow.mjs';
import {cleanup} from './fixtures/cleanup.mjs';

function fixture(t,escaped){
  const base=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'bb-status-envelope-'))),root=path.join(base,'repo');
  fs.mkdirSync(root);
  const store=new BrainStore(path.join(base,'state')),defer=cleanup(t);
  defer(()=>fs.rmSync(base,{recursive:true,force:true}));defer(()=>store.close());
  store.register('p',root);
  const directory=recruitDirectory(store,'p'),ids=[],summary=escaped?'\u0000"\\\n'.repeat(1000):'漢'.repeat(4000),logTail=escaped?summary:'字'.repeat(4000);
  for(let i=0;i<50;i++){
    const id='r'+String(i).padStart(3,'0'),log=path.join(directory,id+'.log');ids.push(id);
    fs.writeFileSync(log,logTail);
    // O worktree já foi removido; os relatórios e logs continuam consultáveis por id.
    saveRecruit(store,'p',{id,project:'p',lane:id,harness:'codex',model:'gpt-6.1-sol',effort:'high',mode:'review',title:'status envelope',
      worktree:path.join(base,'removed',id),branch:'bbx/'+id,base:{commit:'a'.repeat(40)},status:'dismissed',startedAt:new Date(i*1000).toISOString(),lastSeen:new Date(i*1000).toISOString(),
      endedAt:new Date(i*1000).toISOString(),resultSummary:summary,log,commitsAhead:0,head:'a'.repeat(40)});
  }
  const handler=createMcpHandler(makeEngine(store,['p'],{recruit:true}),{principal:{id:'host'}}),frames=[],fatal=[];
  const output=new Writable({write(chunk,encoding,callback){frames.push(Buffer.from(chunk));callback();}}),writer=new McpOutputQueue(output,{onFatal:error=>fatal.push(error)});
  defer(()=>{writer.abort();output.destroy();});
  return {handler,writer,frames,fatal,ids,summary,logTail};
}

for(const modern of [false,true])for(const escaped of [false,true])test('agents_status bounds the complete '+(modern?'modern':'legacy')+' MCP envelope and keeps omitted reports accessible ('+(escaped?'JSON escapes':'CJK')+')',async t=>{
  const f=fixture(t,escaped),meta=modern?{'io.modelcontextprotocol/protocolVersion':MODERN_VERSIONS[0],'io.modelcontextprotocol/clientCapabilities':{}}:null;
  const request=(id,args)=>({jsonrpc:'2.0',id,method:'tools/call',params:{name:'agents_status',arguments:{project:'p',includeLog:true,...args},...(meta?{_meta:meta}:{})}});
  const response=await f.handler.handle(request(1,{}));
  assert.equal(response.result?.structuredContent?.ok,true,JSON.stringify(response.error));
  const bytes=Buffer.byteLength(JSON.stringify(response))+1;
  t.diagnostic('structured bytes: '+Buffer.byteLength(JSON.stringify(response.result.structuredContent))+'; envelope bytes: '+bytes);
  await f.writer.enqueue(response);
  assert(bytes<=512*1024,'complete envelope must stay at most 512 KiB, got '+bytes);
  assert.deepEqual(f.fatal,[],'status polling must not terminate the transport');
  const data=response.result.structuredContent.data;
  assert.equal(data.truncated,true);
  assert.equal(data.count,data.items.length);assert.equal(data.active,0);
  assert(data.items.length>0&&data.items.length<50,'return complete reports that fit the byte budget');
  assert(Array.isArray(data.omittedAgentIds)&&data.omittedAgentIds.length>0,'return ids for every omitted report');
  const returnedIds=data.items.map(item=>item.id);
  assert.equal(new Set([...returnedIds,...data.omittedAgentIds]).size,50);
  assert.deepEqual([...returnedIds,...data.omittedAgentIds].sort(),f.ids,'no report may disappear from the response');
  for(const item of data.items){assert.equal(item.resultSummary,f.summary);assert.equal(item.logTail,f.logTail);}
  const omitted=data.omittedAgentIds[0],detail=await f.handler.handle(request(2,{ids:[omitted]}));
  await f.writer.enqueue(detail);
  assert.equal(detail.result.structuredContent.ok,true);
  assert.equal(detail.result.structuredContent.data.items.length,1);
  assert.equal(detail.result.structuredContent.data.items[0].id,omitted);
  assert.equal(detail.result.structuredContent.data.items[0].resultSummary,f.summary);
  assert.equal(detail.result.structuredContent.data.items[0].logTail,f.logTail);
  assert.equal(detail.result.structuredContent.data.truncated,false);assert.deepEqual(detail.result.structuredContent.data.omittedAgentIds,[]);
  assert.equal(f.frames.length,2,'both status calls reach the actual writer');
});
