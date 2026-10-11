import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { McpRateWindow, McpLineBuffer, McpOutputQueue } from '../src/mcp-flow.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));

// Oráculo independente: lista filtrada a cada evento, sem ring nem índices circulares.
function reference(calls, perMs) { let recent=[];return time=>{recent=recent.filter(t=>time-t<perMs);if(recent.length===calls)return false;recent.push(time);return true;}; }

test('window boundary is exact; refusals do not consume or extend quota',()=>{
  let time=0;const limiter=new McpRateWindow({calls:2,perMs:10,now:()=>time});
  assert(limiter.take());time=1;assert(limiter.take());
  for(time=2;time<10;time++)assert(!limiter.take());
  assert(limiter.take());assert(!limiter.take());time=11;assert(limiter.take());
  assert.equal(limiter.stats().size,2);
});
test('ring agrees with independent window oracle on 60000 deterministic burst/boundary events',()=>{
  for(const calls of [1,2,3,300]){
    let time=0,seed=17;const actual=new McpRateWindow({calls,perMs:73,now:()=>time}),expected=reference(calls,73);
    for(let i=0;i<15000;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      time+=i%37===0?73:i%7===0?1:seed%3;
      assert.equal(actual.take(),expected(time),'event '+i+' calls '+calls);assert(actual.stats().size<=calls);
    }
  }
});
test('clock rollback remains closed even after the host returns a later timestamp',()=>{
  let time=5;const w=new McpRateWindow({now:()=>time});assert(w.take());time=4;
  assert.throws(()=>w.take(),{code:'MCP_CLOCK_INVALID'});time=99;assert.throws(()=>w.take(),{code:'MCP_CLOCK_INVALID'});
});
test('nonfinite and negative rate timestamps never become accepted tokens',()=>{
  for(const time of [Infinity,NaN,-1])assert.throws(()=>new McpRateWindow({now:()=>time}).take(),{code:'MCP_CLOCK_INVALID'});
});
test('unsafe or unlimited quota configurations are refused',()=>{
  for(const calls of [0,-1,Infinity,1.5,100001])assert.throws(()=>new McpRateWindow({calls}),TypeError);
  for(const perMs of [0,-1,Infinity,86400001])assert.throws(()=>new McpRateWindow({perMs}),TypeError);
});
test('line buffer handles every UTF8 byte split without replacing characters',()=>{
  const value='{"text":"ação😀漢字"}\r\n',bytes=Buffer.from(value),lines=[];
  const f=new McpLineBuffer(100);for(const b of bytes)f.feed(Buffer.from([b]),s=>lines.push(s));
  assert.deepEqual(lines,[value.slice(0,-2)]);assert.equal(f.remainingBytes,0);
});
test('malformed UTF8 is not normalized into a valid request',()=>{
  const f=new McpLineBuffer(100);
  assert.throws(()=>f.feed(Buffer.from([123,34,120,34,58,34,0xc3,0x28,34,125,10]),()=>{}),{code:'MCP_INVALID_UTF8'});
});
test('UTF8 state does not leak across frames and incomplete tails are observable',()=>{
  const f=new McpLineBuffer(100),lines=[];f.feed(Buffer.from('one\ntwo\nthree'),s=>lines.push(s));
  assert.deepEqual(lines,['one','two']);assert.equal(f.remainingBytes,5);f.clear();assert.equal(f.remainingBytes,0);
});
test('input chunks are copied; changing a prior Buffer does not poison the retained frame',()=>{
  const f=new McpLineBuffer(20),first=Buffer.from('orig'),lines=[];f.feed(first,s=>lines.push(s));first.fill(120);
  f.feed(Buffer.from('inal\n'),s=>lines.push(s));assert.deepEqual(lines,['original']);
});
test('frame cap is in bytes with CR retained in the cap; overflow is fatal without newline',()=>{
  const f=new McpLineBuffer(4),out=[];f.feed(Buffer.from('áx\r\n'),s=>out.push(s));assert.deepEqual(out,['áx']);
  assert.throws(()=>f.feed(Buffer.from('12345'),()=>{}),{code:'MCP_FRAME_LIMIT'});
});
test('decoder refuses string chunks and honors consumer stop within a chunk',()=>{
  const f=new McpLineBuffer(20),lines=[];assert.throws(()=>f.feed('x',()=>{}),{code:'MCP_INPUT_NOT_BYTES'});
  f.feed(Buffer.from('one\ntwo\n'),s=>{lines.push(s);return false;});assert.deepEqual(lines,['one']);
});

function sink(t, options={}, policy={}){
  const state={callbacks:[],chunks:[],fatal:[]};
  const stream=new Writable({highWaterMark:1,write(chunk,_,callback){state.chunks.push(Buffer.from(chunk));state.callbacks.push(callback);},...options});
  const writer=new McpOutputQueue(stream,{maxFrameBytes:1024,maxBytes:4096,maxFrames:8,writeTimeoutMs:1000,onFatal:e=>state.fatal.push(e),...policy});
  t.after(()=>{writer.abort();stream.destroy();});
  return {writer,stream,...state};
}
test('output backpressure never submits another frame before Writable completion',async t=>{
  const s=sink(t),first=s.writer.enqueue({id:1}),second=s.writer.enqueue({id:2});
  await tick();assert.equal(s.chunks.length,1);assert.equal(s.stream.writableLength,9);
  assert.equal(s.writer.stats().queuedFrames,2);assert.equal(s.writer.stats().queuedBytes,18);
  s.callbacks.shift()();await first;await tick();assert.equal(s.chunks.length,2);
  s.callbacks.shift()();await second;assert.equal(s.writer.stats().queuedFrames,0);assert.equal(s.writer.stats().sentFrames,2);
});
test('queued values cannot be changed by the caller after output admission',async t=>{
  const s=sink(t),a=s.writer.enqueue({id:1}),value={id:2},b=s.writer.enqueue(value);value.id=99;
  s.callbacks.shift()();await a;await tick();s.callbacks.shift()();await b;
  assert.equal(JSON.parse(s.chunks[1]).id,2);
});
test('frame-count pressure fails closed and releases every queued waiter',async t=>{
  const s=sink(t,{}, {maxFrames:2});const a=s.writer.enqueue({id:1}),b=s.writer.enqueue({id:2}),c=s.writer.enqueue({id:3});
  const settled=await Promise.allSettled([a,b,c]);assert(settled.every(x=>x.status==='rejected'));
  assert.equal(s.fatal[0].code,'MCP_OUTPUT_LIMIT');assert.equal(s.chunks.length,1);assert.equal(s.writer.stats().queuedFrames,0);
});
test('output bytes include the active frame, not only items waiting in the queue',async t=>{
  const s=sink(t,{}, {maxFrameBytes:128,maxBytes:128});
  const a=s.writer.enqueue({text:'x'.repeat(70)}),b=s.writer.enqueue({text:'x'.repeat(70)});
  assert((await Promise.allSettled([a,b])).every(x=>x.status==='rejected'));assert.equal(s.fatal[0].code,'MCP_OUTPUT_LIMIT');
});
test('a single oversized response is never partially submitted',async t=>{
  const s=sink(t,{}, {maxFrameBytes:32,maxBytes:64});await assert.rejects(s.writer.enqueue({text:'x'.repeat(40)}),{code:'MCP_RESPONSE_LIMIT'});
  assert.equal(s.chunks.length,0);
});
test('JSON serialization failures do not enqueue output or leak an unhandled rejection',async t=>{
  const s=sink(t),x={};x.self=x;await assert.rejects(s.writer.enqueue(x),{code:'MCP_OUTPUT_ENCODING'});assert.equal(s.chunks.length,0);
});
test('write timeout observes late errors and removes per-write drain listeners',async t=>{
  const s=sink(t,{}, {writeTimeoutMs:15});const work=s.writer.enqueue({id:1});
  await assert.rejects(work,{code:'MCP_WRITE_TIMEOUT'});assert.equal(s.writer.stats().queuedBytes,0);
  assert.equal(s.stream.listenerCount('drain'),0);
  s.callbacks.shift()(new Error('private late diagnostic'));await tick();assert.equal(s.stream.listenerCount('error'),1);
});
test('asynchronous write failure propagates a sanitized terminal code',async t=>{
  const s=sink(t);const work=s.writer.enqueue({id:1});s.callbacks.shift()(new Error('sensitive-payload'));
  await assert.rejects(work,{code:'MCP_OUTPUT_FAILED'});await tick();assert(!s.fatal[0].message.includes('sensitive'));
});
test('output close without error fails pending work instead of leaving a silent session',async t=>{
  const s=sink(t);const work=s.writer.enqueue({id:1});s.stream.destroy();await assert.rejects(work,{code:'MCP_OUTPUT_CLOSED'});
});
test('explicit abort is idempotent and removes nonpersistent listeners',async t=>{
  const s=sink(t);const work=s.writer.enqueue({id:1});s.writer.abort();s.writer.abort();
  await assert.rejects(work,{code:'MCP_OUTPUT_CLOSED'});assert.equal(s.stream.listenerCount('close'),0);assert.equal(s.stream.listenerCount('drain'),0);
});
test('normal stream writes preserve JSON-lines order under real drain events',async t=>{
  const out=[];const stream=new Writable({highWaterMark:1,write(b,_,cb){out.push(b.toString());setImmediate(cb);}});
  const q=new McpOutputQueue(stream,{maxFrames:64});t.after(()=>{q.abort();stream.destroy();});
  await Promise.all(Array.from({length:60},(_,i)=>q.enqueue({i})));
  assert.deepEqual(out.map(x=>JSON.parse(x).i),Array.from({length:60},(_,i)=>i));assert.equal(q.stats().sentFrames,60);
});

test('synchronous delay cannot extend the write deadline just because the timer callback is late',async t=>{
  const stream=new Writable({write(_,__,done){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,12);done();}});
  const writer=new McpOutputQueue(stream,{writeTimeoutMs:2});t.after(()=>{writer.abort();stream.destroy();});
  await assert.rejects(writer.enqueue({id:1}),{code:'MCP_WRITE_TIMEOUT'});
});
