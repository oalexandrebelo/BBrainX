import { test } from 'node:test';import assert from 'node:assert/strict';
import { z } from 'zod';
import { createEngine, defineCapability, EngineError } from '../src/capability.mjs';
import { PassThrough } from 'node:stream';
import { createMcpHandler, serveMcpStdio, toolCatalog, toolName, LEGACY_VERSIONS, MODERN_VERSIONS, PROTOCOL_VERSIONS } from '../src/mcp.mjs';

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

test('a call that is already cancelled never starts, and an abandoned run cannot crash the process',async()=>{
  let runs=0;const unhandled=[];const onUnhandled=reason=>unhandled.push(reason);process.on('unhandledRejection',onUnhandled);
  try{
    const engine=engineWith({
      guarded:capability(({context})=>{runs++;context.signal.throwIfAborted();return {value:'ran'};}),
      late:capability(({context})=>new Promise((_,reject)=>context.signal.addEventListener('abort',()=>setTimeout(()=>reject(new Error('late failure')),5))),{timeoutMs:10})
    });
    const already=new AbortController();already.abort();
    assert.equal((await code(engine.invoke('guarded',{text:'x'},{signal:already.signal}))).code,'CANCELLED');
    assert.equal(runs,0,'run has side effects: a cancelled call must not reach it');
    assert.equal((await code(engine.invoke('late',{text:'x'}))).code,'TIMEOUT');
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.deepEqual(unhandled,[],'a rejection after the deadline must have an owner');
  }finally{process.off('unhandledRejection',onUnhandled);}
});
test('the caller cannot change the input after validation, nor can the access rule',async()=>{
  const seen=[];
  const engine=engineWith({probe:capability(({input})=>{seen.push(input.text);return {value:input.text};},{access:({input})=>{input.text='changed by access';return true;}})});
  const args={text:'original'}, pending=engine.invoke('probe',args);args.text='changed by caller';
  assert.deepEqual(await pending,{value:'original'});assert.deepEqual(seen,['original']);
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

const waitCapability=()=>capability(({context})=>new Promise((_,reject)=>context.signal.addEventListener('abort',()=>reject(new Error('stopped')))));
const modernMeta=(version='2026-07-28')=>({'io.modelcontextprotocol/protocolVersion':version,'io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'probe-client',version:'1'}});

test('MCP legacy era: initialize negotiates the version, falsy ids survive, protocol errors use JSON-RPC codes',async()=>{
  const handler=createMcpHandler(engineWith({echo:capability(({input})=>({value:input.text}))}),{instructions:'use it well'});
  const known=await handler.handle({jsonrpc:'2.0',id:0,method:'initialize',params:{protocolVersion:'2024-11-05'}});
  assert.equal(known.id,0);assert.equal(known.result.protocolVersion,'2024-11-05');assert.equal(known.result.instructions,'use it well');
  assert.deepEqual(known.result.serverInfo,{name:'probe',version:'1.0.0'});assert.deepEqual(known.result.capabilities,{tools:{}});
  for(const requested of ['1999-01-01','2026-07-28','2024-10-07']){
    const reply=await handler.handle({jsonrpc:'2.0',id:'',method:'initialize',params:{protocolVersion:requested}});
    assert.equal(reply.id,'');assert.equal(reply.result.protocolVersion,LEGACY_VERSIONS[0],'initialize always answers with a handshake-era version');
  }
  const ok=await handler.handle({jsonrpc:'2.0',id:8,method:'tools/call',params:{name:'echo',arguments:{text:'hi'},_meta:{progressToken:'p1'}}});
  assert.deepEqual(ok.result,{content:[{type:'text',text:'{"value":"hi"}'}],structuredContent:{value:'hi'}},'a legacy result carries no modern field');
  assert.deepEqual((await handler.handle({jsonrpc:'2.0',id:9,method:'tools/list'})).result,{tools:toolCatalog(engineWith({echo:capability(()=>({value:'x'}))})).tools});
  assert.deepEqual((await handler.handle({jsonrpc:'2.0',id:10,method:'ping'})).result,{});
  assert.equal((await handler.handle({jsonrpc:'2.0',id:11,method:'tools/call',params:{name:'echo',arguments:['x']}})).error.code,-32602);
  assert.deepEqual((await handler.handle({jsonrpc:'2.0',id:12,method:'tools/call',params:{name:'nope'}})).error,{code:-32602,message:'Unknown tool: nope'});
  assert.equal((await handler.handle({jsonrpc:'2.0',id:13,method:'resources/list'})).error.code,-32601);
  assert.equal((await handler.handle({jsonrpc:'1.0',id:14,method:'ping'})).error.code,-32600);
  for(const id of [{},1.5,null,true])assert.deepEqual(await handler.handle({jsonrpc:'2.0',id,method:'ping'}),{jsonrpc:'2.0',id:null,error:{code:-32600,message:'Request id must be a string or an integer.'}});
  assert.equal(await handler.handle({jsonrpc:'2.0',id:15,result:{}}),undefined);
});

test('MCP modern era: no handshake, version and capabilities travel in every request',async()=>{
  const handler=createMcpHandler(engineWith({echo:capability(({input})=>({value:input.text}))}),{instructions:'use it well'});
  const serverMeta={'io.modelcontextprotocol/serverInfo':{name:'probe',version:'1.0.0'}};
  const discovered=await handler.handle({jsonrpc:'2.0',id:'d',method:'server/discover',params:{_meta:modernMeta()}});
  assert.deepEqual(discovered.result,{resultType:'complete',supportedVersions:[...PROTOCOL_VERSIONS],capabilities:{tools:{}},instructions:'use it well',ttlMs:300000,cacheScope:'public',_meta:serverMeta});
  assert.deepEqual([...PROTOCOL_VERSIONS],[...MODERN_VERSIONS,...LEGACY_VERSIONS]);assert.ok(!PROTOCOL_VERSIONS.includes('2024-10-07'),'only published revisions');
  const listed=await handler.handle({jsonrpc:'2.0',id:1,method:'tools/list',params:{_meta:modernMeta()}});
  assert.equal(listed.result.resultType,'complete');assert.equal(listed.result.ttlMs,300000);assert.equal(listed.result.cacheScope,'public');
  assert.deepEqual(listed.result._meta,serverMeta);assert.deepEqual(listed.result.tools.map(tool=>tool.name),['echo']);
  const called=await handler.handle({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'echo',arguments:{text:'hi'},_meta:modernMeta()}});
  assert.deepEqual(called.result,{resultType:'complete',content:[{type:'text',text:'{"value":"hi"}'}],structuredContent:{value:'hi'},_meta:serverMeta});
  const refused=await handler.handle({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'echo',arguments:{text:5},_meta:modernMeta()}});
  assert.equal(refused.result.resultType,'complete');assert.equal(refused.result.isError,true);assert.equal(JSON.parse(refused.result.content[0].text).code,'INPUT_INVALID');
  // Versão que o servidor não fala: erro moderno reconhecível, com a lista do que ele fala.
  for(const requested of ['2027-01-01','2025-11-25'])assert.deepEqual((await handler.handle({jsonrpc:'2.0',id:4,method:'tools/list',params:{_meta:modernMeta(requested)}})).error,{code:-32022,message:'Unsupported protocol version',data:{supported:[...PROTOCOL_VERSIONS],requested}});
  assert.equal((await handler.handle({jsonrpc:'2.0',id:5,method:'server/discover',params:{_meta:modernMeta('2027-01-01')}})).error.code,-32022);
  // Metadado obrigatório ausente ou malformado.
  const noCapabilities={'io.modelcontextprotocol/protocolVersion':'2026-07-28'};
  assert.equal((await handler.handle({jsonrpc:'2.0',id:6,method:'tools/list',params:{_meta:noCapabilities}})).error.code,-32602);
  assert.equal((await handler.handle({jsonrpc:'2.0',id:7,method:'tools/list',params:{_meta:{...modernMeta(),'io.modelcontextprotocol/protocolVersion':20260728}}})).error.code,-32602);
  assert.equal((await handler.handle({jsonrpc:'2.0',id:8,method:'server/discover'})).error.code,-32602,'discover without metadata is malformed, not unknown');
  // O que a era moderna removeu não existe para quem chega com metadados modernos.
  for(const method of ['ping','initialize','logging/setLevel'])assert.equal((await handler.handle({jsonrpc:'2.0',id:9,method,params:{_meta:modernMeta()}})).error.code,-32601,method);
});

test('a cancelled request gets no further message, in either era; only its own call stops',async()=>{
  const handler=createMcpHandler(engineWith({wait:waitCapability(),echo:capability(({input})=>({value:input.text}))}));
  for(const meta of [undefined,modernMeta()]){
    const target=handler.handle({jsonrpc:'2.0',id:0,method:'tools/call',params:{name:'wait',arguments:{text:'x'},...(meta?{_meta:meta}:{})}});
    const other=handler.handle({jsonrpc:'2.0',id:'',method:'tools/call',params:{name:'wait',arguments:{text:'x'}}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(await handler.handle({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:0,reason:'user'}}),undefined);
    assert.equal(await target,undefined,'no response for the cancelled request');
    assert.equal(await Promise.race([other,new Promise(resolve=>setTimeout(()=>resolve('still running'),20))]),'still running');
    assert.equal(await handler.handle({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:''}}),undefined);assert.equal(await other,undefined);
  }
  assert.equal(await handler.handle({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:'unknown'}}),undefined);
  assert.equal(await handler.handle({jsonrpc:'2.0',method:'notifications/cancelled'}),undefined);
  // Cancelar antes de a chamada começar: sem resposta e sem execução.
  const early=handler.handle({jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'echo',arguments:{text:'never'}}});
  handler.handle({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:7}});
  assert.equal(await early,undefined);
});

test('a domain refusal is a tool error; too many calls are refused until the window moves',async()=>{
  let time=0;const envelope=z.object({ok:z.boolean(),error:z.string().nullable()}).strict();
  const engine=engineWith({op:defineCapability({description:'probe',input:z.object({fail:z.boolean()}).strict(),output:envelope,access:'public',run:({input})=>input.fail?{ok:false,error:'VERSION_CONFLICT'}:{ok:true,error:null}})});
  const handler=createMcpHandler(engine,{isFailure:output=>output?.ok===false,rateLimit:{calls:3,perMs:1000},now:()=>time});
  const call=(id,fail)=>handler.handle({jsonrpc:'2.0',id,method:'tools/call',params:{name:'op',arguments:{fail}}});
  const fine=await call(1,false);assert.equal(fine.result.isError,undefined);
  const refused=await call(2,true);assert.equal(refused.result.isError,true);assert.deepEqual(refused.result.structuredContent,{ok:false,error:'VERSION_CONFLICT'});
  await call(3,false);
  const limited=await call(4,false);assert.equal(limited.result.isError,true);assert.equal(JSON.parse(limited.result.content[0].text).code,'RATE_LIMITED');assert.equal(limited.result.structuredContent,undefined);
  assert.equal((await handler.handle({jsonrpc:'2.0',id:5,method:'tools/list'})).result.tools.length,1,'only tool calls are limited');
  time=999;assert.equal((await call(6,false)).result.isError,true);
  time=1000;assert.equal((await call(7,false)).result.isError,undefined,'the window moved');
});

test('stdio: a line at the limit is served, one byte more stops the server; input end cancels what is running',async()=>{
  const engine=engineWith({wait:waitCapability(),echo:capability(({input})=>({value:input.text}))});
  function open(maxLineBytes){
    const input=new PassThrough(), output=new PassThrough(), lines=[];let buffer='';
    output.setEncoding('utf8').on('data',chunk=>{buffer+=chunk;for(let at=buffer.indexOf('\n');at!==-1;at=buffer.indexOf('\n')){lines.push(JSON.parse(buffer.slice(0,at)));buffer=buffer.slice(at+1);}});
    return {input,lines,done:serveMcpStdio(engine,{input,output,maxLineBytes})};
  }
  const padded=bytes=>{const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'ping'});return body+' '.repeat(bytes-Buffer.byteLength(body));};
  const exact=open(120);exact.input.write(padded(119)+'\r\n');exact.input.write(padded(60)+'\n'+padded(120)+'\n');exact.input.end();
  await exact.done;assert.deepEqual(exact.lines,[{jsonrpc:'2.0',id:1,result:{}},{jsonrpc:'2.0',id:1,result:{}},{jsonrpc:'2.0',id:1,result:{}}]);
  // Sem o limite, o servidor seguiria esperando: o teste precisa reprovar em vez de travar.
  const outcome=promise=>Promise.race([promise.then(()=>'served',error=>error.message),new Promise(resolve=>setTimeout(()=>resolve('still open'),2000))]);
  const over=open(120);over.input.write(padded(60)+'\n'+padded(121)+'\n');
  assert.match(await outcome(over.done),/read buffer exceeded the configured limit of 120 bytes/);
  const unterminated=open(120);unterminated.input.write(padded(121));
  assert.match(await outcome(unterminated.done),/read buffer exceeded/);
  // Entrada fechada com uma chamada em andamento: o servidor encerra logo e não escreve mais nada por ela.
  const closing=open(4096);closing.input.write(JSON.stringify({jsonrpc:'2.0',id:9,method:'tools/call',params:{name:'wait',arguments:{text:'x'}}})+'\n');
  await new Promise(resolve=>setImmediate(resolve));
  closing.input.end();
  assert.equal(await outcome(closing.done),'served','the server must not wait for the running call');assert.deepEqual(closing.lines,[]);
});
