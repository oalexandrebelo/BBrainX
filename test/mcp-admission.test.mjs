import test from 'node:test';import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { createMcpHandler, serveMcpStdio } from '../src/mcp.mjs';
import { createEngine } from '../src/capability.mjs';
import { textCapability } from './fixtures/contract-engine.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
const call=(id,args={text:'x'},extra={})=>({jsonrpc:'2.0',id,method:'tools/call',params:{name:'op',arguments:args,...extra}});
const cancel=id=>({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:id}});
const meta={_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}}};
function domain(){
  const pending=[],signals=[],starts=[];
  const cap=textCapability();cap.run=({input,context})=>{starts.push(input.text);signals.push(context.signal);return new Promise(resolve=>pending.push(()=>resolve({length:input.text.length})));};
  const engine=createEngine({name:'bounded-domain',version:'1',capabilities:{op:cap}});
  return {engine,pending,signals,starts};
}
function open(t,{engine,...options}={}){
  engine??=createEngine({name:'bounded-domain',version:'1',capabilities:{op:textCapability()}});
  const input=new PassThrough(),output=options.output??new PassThrough(),lines=[];let text='';
  if(!options.output)output.on('data',b=>{text+=b.toString();let pos;while((pos=text.indexOf('\n'))>=0){lines.push(JSON.parse(text.slice(0,pos)));text=text.slice(pos+1);}});
  const done=serveMcpStdio(engine,{input,output,principal:{id:'host'},shutdownMs:80,...options});void done.catch(()=>{});
  t.after(async()=>{input.end();try{await done;}catch{}input.destroy();output.destroy();});
  return {input,output,lines,done,send:x=>input.write(JSON.stringify(x)+'\n')};
}
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.fail('condition not reached');}

test('in-flight invocation capacity is independent of rate and preserves room for cancellation',async()=>{
  const d=domain(),h=createMcpHandler(d.engine,{principal:{id:'host'},maxInFlightCalls:1,rateLimit:{calls:2,perMs:1000}});
  const first=h.handle(call(1));await tick();
  const refused=await h.handle(call(2));assert.equal(JSON.parse(refused.result.content[0].text).code,'MCP_BUSY');
  assert.equal(h.stats().rate.size,1);assert.equal(d.starts.length,1);
  await h.handle(cancel(1));assert.equal(await first,undefined);assert(d.signals[0].aborted);
  const next=h.handle(call(3));await tick();d.pending[1]();assert.equal((await next).result.structuredContent.length,1);d.pending[0]();
});
test('duplicate active handler ID cannot overwrite the controller of the original call',async()=>{
  const d=domain(),h=createMcpHandler(d.engine,{principal:{id:'host'}}),original=h.handle(call('same'));
  await tick();const duplicate=await h.handle(call('same'));assert(duplicate.error,'duplicate must be a protocol refusal, not another invocation');assert.equal(duplicate.error.code,-32600);assert.equal(d.starts.length,1);
  await h.handle(cancel('same'));assert.equal(await original,undefined);assert(d.signals[0].aborted);d.pending[0]();
});
test('numeric and string IDs have independent cancellation targets',async()=>{
  const d=domain(),h=createMcpHandler(d.engine,{principal:{id:'host'}}),a=h.handle(call(1)),b=h.handle(call('1'));
  await tick();await h.handle(cancel(1));assert.equal(await a,undefined);assert(!d.signals[1].aborted);
  d.pending[1]();assert.equal((await b).id,'1');d.pending[0]();
});
test('MCP_BUSY uses the same modern result envelope without broadening authorization',async()=>{
  const d=domain(),h=createMcpHandler(d.engine,{principal:{id:'host'},maxInFlightCalls:1}),a=h.handle(call(1,{text:'x'},meta));
  const b=await h.handle(call(2,{text:'x'},meta));assert.equal(b.result.resultType,'complete');assert(b.result.isError);
  assert.equal(JSON.parse(b.result.content[0].text).code,'MCP_BUSY');h.cancelAll();assert.equal(await a,undefined);
});
test('unsafe numeric IDs and oversized string IDs are refused before invocation',async()=>{
  const d=domain(),h=createMcpHandler(d.engine,{principal:{id:'host'}});
  for(const id of [Number.MAX_SAFE_INTEGER+1,1.5,'é'.repeat(513)])assert.equal((await h.handle(call(id))).error.code,-32600);
  assert.equal(d.starts.length,0);
});
test('host principal snapshot cannot be changed while queued input is interpreted',async()=>{
  const cap=textCapability();cap.run=({context})=>({length:context.principal.id.length});
  const principal={id:'host'},e=createEngine({name:'a',version:'1',capabilities:{op:cap}}),h=createMcpHandler(e,{principal});principal.id='';
  assert.equal((await h.handle(call(1))).result.structuredContent.length,4);
});
test('duplicate IDs inside a batch reject the whole frame before any invocation',async t=>{
  const d=domain(),s=open(t,{engine:d.engine});s.send([call('x'),call('x')]);
  await assert.rejects(s.done,{code:'MCP_DUPLICATE_REQUEST_ID'});assert.equal(d.starts.length,0);assert.deepEqual(s.lines,[]);
});
test('duplicate across methods is connection-fatal, not a competing response with the same ID',async t=>{
  const d=domain(),s=open(t,{engine:d.engine});s.send(call('x'));await until(()=>d.starts.length===1);
  s.send({jsonrpc:'2.0',id:'x',method:'ping'});await assert.rejects(s.done,{code:'MCP_DUPLICATE_REQUEST_ID'});
  assert.deepEqual(s.lines,[]);assert(d.signals[0].aborted);d.pending[0]();
});
test('an ID is not reusable while its response is waiting on a slow output sink',async t=>{
  let complete;const output=new Writable({write(_,__,cb){complete=cb;}}),s=open(t,{output});
  s.send({jsonrpc:'2.0',id:'slow-output',method:'ping'});await until(()=>complete!==undefined);
  s.send({jsonrpc:'2.0',id:'slow-output',method:'ping'});
  await assert.rejects(s.done,{code:'MCP_DUPLICATE_REQUEST_ID'});complete();
});
test('sequential ID reuse after response completion remains supported',async t=>{
  const s=open(t);s.send({jsonrpc:'2.0',id:0,method:'ping'});await until(()=>s.lines.length===1);
  s.send({jsonrpc:'2.0',id:0,method:'ping'});await until(()=>s.lines.length===2);s.input.end();assert((await s.done).drained);
});
test('batch fan-out is bounded before any member is invoked',async t=>{
  const d=domain(),s=open(t,{engine:d.engine,maxBatchItems:2});s.send([call(1),call(2),call(3)]);
  await assert.rejects(s.done,{code:'MCP_BATCH_LIMIT'});assert.equal(d.starts.length,0);
});
test('pending response frames are bounded even for ping-only floods',async t=>{
  const output=new Writable({write(){}}),s=open(t,{output,maxPendingMessages:2});
  s.input.write([1,2,3].map(id=>JSON.stringify({jsonrpc:'2.0',id,method:'ping'})).join('\n')+'\n');
  await assert.rejects(s.done,{code:'MCP_PENDING_LIMIT'});
});
test('cancellation and ping remain processable while tools fill the invocation limit',async t=>{
  const d=domain(),s=open(t,{engine:d.engine,maxInFlightCalls:1});s.send(call(1));await until(()=>d.starts.length===1);
  s.send(call(2));await until(()=>s.lines.length===1);assert.equal(JSON.parse(s.lines[0].result.content[0].text).code,'MCP_BUSY');
  s.send(cancel(1));s.send({jsonrpc:'2.0',id:3,method:'ping'});await until(()=>s.lines.length===2);
  assert.equal(s.lines[1].id,3);assert(d.signals[0].aborted);d.pending[0]();s.input.end();assert((await s.done).drained);
});
test('EOF cancels a cooperative tool and drains only completed responses',async t=>{
  const d=domain(),s=open(t,{engine:d.engine});s.send(call(1));await until(()=>d.starts.length===1);s.input.end();
  assert((await s.done).drained);assert.deepEqual(s.lines,[]);assert(d.signals[0].aborted);d.pending[0]();
});
test('uncooperative invocation cannot make shutdown wait indefinitely or certify work termination',async t=>{
  const d=domain();let resolve;
  const engine={name:d.engine.name,version:d.engine.version,list:()=>d.engine.list(),describe:id=>d.engine.describe(id),
    invoke(){return new Promise(r=>{resolve=r;});}};
  const s=open(t,{engine,shutdownMs:20});s.send(call(1));await until(()=>resolve!==undefined);s.input.end();
  await assert.rejects(s.done,error=>error.code==='MCP_SHUTDOWN_INCOMPLETE'&&error.report.physicalWorkStopped===null);
  resolve({length:1});await tick();assert.deepEqual(s.lines,[]);
});
test('unexpected output close terminates a session with sanitized error',async t=>{
  const s=open(t);s.output.destroy();await assert.rejects(s.done,{code:'MCP_OUTPUT_CLOSED'});
});
test('frame with invalid UTF8 never reaches the domain as replacement text',async t=>{
  const d=domain(),s=open(t,{engine:d.engine});const bytes=Buffer.from(JSON.stringify(call(1,{text:'X'}))+'\n');bytes[bytes.indexOf(88)]=0xff;
  s.input.write(bytes);await assert.rejects(s.done,{code:'MCP_INVALID_UTF8'});assert.equal(d.starts.length,0);
});
test('unterminated tail at EOF is reported rather than presented as processed',async t=>{
  const s=open(t);s.input.end('{"jsonrpc":"2.0"');await assert.rejects(s.done,{code:'MCP_INCOMPLETE_FRAME'});
});
test('disconnected input produces no unhandled late writes after the handler eventually resolves',async t=>{
  const d=domain(),s=open(t,{engine:d.engine});s.send(call(1));await until(()=>d.starts.length===1);
  s.input.destroy();await assert.rejects(s.done,{code:'MCP_INPUT_CLOSED'});d.pending[0]();await tick();assert.deepEqual(s.lines,[]);
});
test('normal shutdown removes input listeners and leaves only the late-error guard on output',async t=>{
  const s=open(t);s.send({jsonrpc:'2.0',id:1,method:'ping'});await until(()=>s.lines.length===1);s.input.end();await s.done;
  for(const event of ['readable','end','close'])assert.equal(s.input.listenerCount(event),0,event);
  assert.equal(s.input.listenerCount('error'),1);assert.equal(s.output.listenerCount('drain'),0);assert.equal(s.output.listenerCount('close'),0);assert.equal(s.output.listenerCount('error'),1);
});

test('invalid objects without ID still receive the JSON-RPC error rather than becoming notifications',async t=>{
  const s=open(t);s.send({});await until(()=>s.lines.length===1);assert.equal(s.lines[0].error.code,-32600);assert.equal(s.lines[0].id,null);
});
test('preclosed streams and errors after teardown never leave serve waiting forever',async t=>{
  const output=new PassThrough();output.destroy();await tick();const s=open(t,{output});
  await assert.rejects(s.done,{code:'MCP_OUTPUT_CLOSED'});
  s.input.emit('error',new Error('late test error'));output.emit('error',new Error('late test error'));
});
