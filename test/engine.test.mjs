import { test } from 'node:test';import assert from 'node:assert/strict';
import { z } from 'zod';
import { createEngine, defineCapability, EngineError } from '../src/capability.mjs';
import { createMcpHandler, toolCatalog, toolName, PROTOCOL_VERSIONS } from '../src/mcp.mjs';

const output=z.object({value:z.string()}).strict();
function engineWith(capabilities,onEvent){return createEngine({name:'probe',version:'1.0.0',capabilities,onEvent});}
const capability=(run,extra={})=>defineCapability({description:'probe',input:z.object({text:z.string().max(20)}).strict(),output,access:'public',run,...extra});
const code=async promise=>{try{await promise;}catch(error){assert.ok(error instanceof EngineError,'expected an EngineError, got '+error);return error;}assert.fail('expected a rejection');};

test('engine validates input and output and reports the path of each issue',async()=>{
  const engine=engineWith({echo:capability(({input})=>({value:input.text})),broken:capability(()=>({value:1}))});
  assert.deepEqual(await engine.invoke('echo',{text:'ok'}),{value:'ok'});
  const invalid=await code(engine.invoke('echo',{text:'ok',extra:true}));
  assert.equal(invalid.code,'INPUT_INVALID');assert.ok(invalid.publicDetails.issues.length>=1);
  const long=await code(engine.invoke('echo',{text:'x'.repeat(21)}));
  assert.deepEqual(long.publicDetails.issues[0].path,['text']);
  assert.equal((await code(engine.invoke('broken',{text:'ok'}))).code,'OUTPUT_INVALID');
  assert.equal((await code(engine.invoke('missing',{}))).code,'CAPABILITY_NOT_FOUND');
});

test('engine separates a missing principal from a refused one and never runs a refused call',async()=>{
  let runs=0;
  const guarded=capability(()=>{runs++;return {value:'ran'};},{access:({principal,input})=>!!principal&&input.text==='allowed'});
  const engine=engineWith({guarded,signed:capability(()=>({value:'ok'}),{access:'authenticated'})});
  assert.equal((await code(engine.invoke('guarded',{text:'allowed'}))).code,'UNAUTHENTICATED');
  assert.equal((await code(engine.invoke('guarded',{text:'other'},{principal:{id:'host'}}))).code,'FORBIDDEN');
  assert.equal(runs,0);
  assert.deepEqual(await engine.invoke('guarded',{text:'allowed'},{principal:{id:'host'}}),{value:'ran'});
  assert.equal((await code(engine.invoke('signed',{text:'x'}))).code,'UNAUTHENTICATED');
  assert.equal((await code(engine.invoke('signed',{text:'x'},{principal:{id:''}}))).code,'UNAUTHENTICATED');
});

test('engine tells a deadline from a cancellation and hides the cause of an unexpected failure',async()=>{
  const engine=engineWith({
    slow:capability(()=>new Promise(()=>{}),{timeoutMs:25}),
    waits:capability(({context})=>new Promise((_,reject)=>context.signal.addEventListener('abort',()=>reject(new Error('stopped'))))),
    leaks:capability(()=>{throw new Error('/Users/someone/secret/path');})
  });
  assert.equal((await code(engine.invoke('slow',{text:'x'}))).code,'TIMEOUT');
  const controller=new AbortController(), pending=code(engine.invoke('waits',{text:'x'},{signal:controller.signal}));
  controller.abort(new Error('user pressed stop'));
  assert.equal((await pending).code,'CANCELLED');
  const already=new AbortController();already.abort();
  assert.equal((await code(engine.invoke('waits',{text:'x'},{signal:already.signal}))).code,'CANCELLED');
  const failed=await code(engine.invoke('leaks',{text:'x'}));
  assert.equal(failed.code,'EXECUTION_FAILED');assert.ok(!failed.message.includes('secret'));assert.equal(failed.publicDetails,undefined);
});

test('engine events carry identifiers and timing, never arguments or results; a failing observer changes nothing',async()=>{
  const events=[];
  const engine=engineWith({echo:capability(({input})=>({value:input.text})),leaks:capability(()=>{throw new Error('boom');})},event=>{events.push(event);throw new Error('observer failed');});
  assert.deepEqual(await engine.invoke('echo',{text:'private-text'},{requestId:'r1',source:'test'}),{value:'private-text'});
  await code(engine.invoke('leaks',{text:'private-text'},{requestId:'r2'}));
  assert.deepEqual(events.map(event=>event.type),['invocation.started','invocation.completed','invocation.started','invocation.failed']);
  assert.equal(events[3].code,'EXECUTION_FAILED');assert.equal(events[0].requestId,'r1');assert.ok(events[1].durationMs>=0);
  assert.ok(!JSON.stringify(events).includes('private-text'));
});

test('engine refuses a capability it cannot describe or bound',()=>{
  assert.throws(()=>engineWith({bad:capability(()=>({value:'x'}),{input:z.string()})}),/object root/);
  assert.throws(()=>engineWith({bad:capability(()=>({value:'x'}),{timeoutMs:0})}),/timeoutMs/);
  assert.throws(()=>engineWith({bad:capability(()=>({value:'x'}),{input:{'~standard':{validate:()=>({value:{}})}}})}),/JSON Schema/);
});

test('MCP catalog publishes portable names, hints and both schemas, and rejects a collision',()=>{
  const engine=engineWith({'context.search':capability(()=>({value:'x'}),{annotations:{readOnly:true,destructive:false}}),plain:capability(()=>({value:'x'}),{title:'Plain'})});
  const {tools,capabilityFor}=toolCatalog(engine);
  assert.deepEqual(tools.map(tool=>tool.name),['context_search','plain']);
  assert.deepEqual(tools[0].annotations,{readOnlyHint:true,destructiveHint:false});
  assert.equal(tools[1].annotations,undefined);assert.equal(tools[1].title,'Plain');
  assert.equal(tools[0].inputSchema.type,'object');assert.equal(tools[0].outputSchema.type,'object');
  assert.equal(capabilityFor('context_search'),'context.search');assert.equal(capabilityFor('context.search'),undefined);
  const long=toolName('a.'.repeat(60));assert.equal(long.length,64);assert.match(long,/_[0-9a-f]{12}$/);
  assert.notEqual(long,toolName('a.'.repeat(61)));
  assert.throws(()=>toolCatalog(engineWith({'a.b':capability(()=>({value:'x'})),'a_b':capability(()=>({value:'x'}))})),/same MCP tool name/);
});

test('MCP handler negotiates the version, keeps falsy ids, and cancels a running call on request',async()=>{
  const engine=engineWith({wait:capability(({context})=>new Promise((_,reject)=>context.signal.addEventListener('abort',()=>reject(new Error('stopped'))))),echo:capability(({input})=>({value:input.text}))});
  const handler=createMcpHandler(engine,{instructions:'use it well'});
  const known=await handler.handle({jsonrpc:'2.0',id:0,method:'initialize',params:{protocolVersion:'2024-11-05'}});
  assert.equal(known.id,0);assert.equal(known.result.protocolVersion,'2024-11-05');assert.equal(known.result.instructions,'use it well');
  assert.deepEqual(known.result.serverInfo,{name:'probe',version:'1.0.0'});assert.deepEqual(known.result.capabilities,{tools:{}});
  const unknown=await handler.handle({jsonrpc:'2.0',id:'',method:'initialize',params:{protocolVersion:'1999-01-01'}});
  assert.equal(unknown.id,'');assert.equal(unknown.result.protocolVersion,PROTOCOL_VERSIONS[0]);
  const running=handler.handle({jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'wait',arguments:{text:'x'}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(await handler.handle({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:7}}),undefined);
  const cancelled=await running;
  assert.equal(cancelled.result.isError,true);assert.equal(JSON.parse(cancelled.result.content[0].text).code,'CANCELLED');
  const ok=await handler.handle({jsonrpc:'2.0',id:8,method:'tools/call',params:{name:'echo',arguments:{text:'hi'}}});
  assert.deepEqual(ok.result.structuredContent,{value:'hi'});assert.equal(ok.result.content[0].text,JSON.stringify(ok.result.structuredContent));assert.equal(ok.result.isError,undefined);
  assert.equal((await handler.handle({jsonrpc:'2.0',id:9,method:'tools/call',params:{name:'echo',arguments:['x']}})).error.code,-32602);
  assert.equal((await handler.handle({jsonrpc:'2.0',id:10,method:'tools/call',params:{name:'nope'}})).error.code,-32602);
  assert.equal((await handler.handle({jsonrpc:'2.0',id:11,method:'resources/list'})).error.code,-32601);
  assert.equal((await handler.handle({jsonrpc:'1.0',id:12,method:'ping'})).error.code,-32600);
  assert.equal((await handler.handle({jsonrpc:'2.0',id:{},method:'ping'})).error.code,-32600);
  assert.equal(await handler.handle({jsonrpc:'2.0',id:13,result:{}}),undefined);
});
