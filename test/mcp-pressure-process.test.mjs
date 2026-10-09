import test from 'node:test';import assert from 'node:assert/strict';
import { fork } from 'node:child_process';import { fileURLToPath } from 'node:url';
const file=fileURLToPath(new URL('./fixtures/mcp-pressure-child.mjs',import.meta.url));
const req=(id,arguments_={text:'x'},meta={})=>({jsonrpc:'2.0',id,method:'tools/call',params:{name:'work',arguments:arguments_,...meta}});
const cancellation=id=>({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:id}});
const modern={_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}}};
function child(t,options={},read=true){
  const p=fork(file,[JSON.stringify(options)],{stdio:['pipe','pipe','pipe','ipc'],execArgv:[]});
  const events=[],lines=[],waiters=new Set();let partial='',stderr='';
  const wake=()=>{for(const waiter of [...waiters])waiter();};
  p.on('message',m=>{events.push(m);wake();});
  p.stdin.on('error',()=>{});p.stderr.on('data',b=>{stderr+=b;});
  if(read)p.stdout.on('data',b=>{partial+=b;let at;while((at=partial.indexOf('\n'))>=0){lines.push(JSON.parse(partial.slice(0,at)));partial=partial.slice(at+1);}wake();});
  else p.stdout.pause();
  const exit=new Promise((resolve,reject)=>{const deadline=setTimeout(()=>{p.kill('SIGKILL');reject(new Error('owned child did not exit'));},8000);p.once('error',e=>{clearTimeout(deadline);reject(e);});p.once('exit',(code,signal)=>{clearTimeout(deadline);resolve({code,signal});});});void exit.catch(()=>{});
  const wait=predicate=>new Promise((resolve,reject)=>{
    const check=()=>{const result=predicate();if(result){clearTimeout(timer);waiters.delete(check);resolve(result);}};
    const timer=setTimeout(()=>{waiters.delete(check);reject(new Error('child condition timeout: '+stderr));},8000);
    waiters.add(check);check();
  });
  t.after(async()=>{if(p.exitCode===null&&p.signalCode===null){p.kill('SIGKILL');}await exit;p.stdin.destroy();p.stdout.destroy();p.stderr.destroy();});
  return {p,events,lines,exit,wait,ready:()=>wait(()=>events.find(e=>e.event==='ready')),send:m=>p.stdin.write(JSON.stringify(m)+'\n'),
    finish:()=>wait(()=>events.find(e=>e.event==='finished')),end:()=>p.stdin.end()};
}
for(const metadata of [{},modern])test('real child: crowded tools preserve ping and exact cancellation in '+(metadata._meta?'modern':'legacy')+' mode',async t=>{
  const s=child(t,{maxInFlightCalls:1});await s.ready();s.send(req(1,{text:'one',delayMs:900},metadata));
  await s.wait(()=>s.events.find(e=>e.event==='started'));s.send(req(2,{text:'two'},metadata));
  await s.wait(()=>s.lines.length===1);assert.equal(JSON.parse(s.lines[0].result.content[0].text).code,'MCP_BUSY');
  s.send(cancellation(1));s.send({jsonrpc:'2.0',id:3,method:'ping'});await s.wait(()=>s.lines.length===2);
  assert.equal(s.lines[1].id,3);s.end();const done=await s.finish();assert.equal(done.started,1);assert.equal(done.aborted,1);
  assert.equal((await s.exit).code,0);assert(!s.lines.some(r=>r.id===1));
});
test('real child: duplicate active request stops the connection without emitting a competing response',async t=>{
  const s=child(t);await s.ready();s.send(req('shared-id',{text:'one',delayMs:900}));await s.wait(()=>s.events.find(e=>e.event==='started'));
  s.send(req('shared-id',{text:'two'}));const done=await s.finish();assert.equal(done.error,'MCP_DUPLICATE_REQUEST_ID');
  assert.equal(done.started,1);assert.equal(done.aborted,1);assert.equal((await s.exit).code,1);assert.deepEqual(s.lines,[]);
});
test('real child: unread OS pipe reaches a bounded write timeout instead of accepting unlimited buffered output',async t=>{
  const s=child(t,{writeTimeoutMs:80,maxOutputBytes:2097152},false);await s.ready();s.send(req(1,{text:'large',bytes:524288}));
  const done=await s.finish();assert.equal(done.error,'MCP_WRITE_TIMEOUT');assert.equal(done.started,1);
  assert(done.report.output.peakBytes<=2097152);assert.equal(done.report.output.sentFrames,0);s.p.stdout.resume();assert.equal((await s.exit).code,1);
});
test('real child: batch cap refuses fan-out before any domain operation starts',async t=>{
  const s=child(t,{maxBatchItems:2});await s.ready();s.send([req(1),req(2),req(3)]);
  const done=await s.finish();assert.equal(done.error,'MCP_BATCH_LIMIT');assert.equal(done.started,0);assert.equal((await s.exit).code,1);
});
test('real child: same-chunk cancellation still prevents execution before the first domain step',async t=>{
  const s=child(t);await s.ready();s.p.stdin.write(JSON.stringify(req(1))+'\n'+JSON.stringify(cancellation(1))+'\n'+JSON.stringify({jsonrpc:'2.0',id:2,method:'ping'})+'\n');
  await s.wait(()=>s.lines.length===1);assert.equal(s.lines[0].id,2);s.end();const done=await s.finish();assert.equal(done.started,0);assert.equal((await s.exit).code,0);
});
test('real children: identical IDs in two connections have independent cancellation and admission',async t=>{
  const a=child(t,{maxInFlightCalls:1}),b=child(t,{maxInFlightCalls:1});await Promise.all([a.ready(),b.ready()]);
  a.send(req(1,{text:'A',delayMs:700}));b.send(req(1,{text:'B',delayMs:60}));
  await a.wait(()=>a.events.find(e=>e.event==='started'));a.send(cancellation(1));
  await b.wait(()=>b.lines.length===1);assert.equal(b.lines[0].result.structuredContent.text,'B');a.end();b.end();
  const [ra,rb]=await Promise.all([a.finish(),b.finish()]);assert.equal(ra.aborted,1);assert.equal(rb.aborted,0);assert.deepEqual(a.lines,[]);
  assert.equal((await a.exit).code,0);assert.equal((await b.exit).code,0);
});
test('real child: random invalid UTF8 byte is fatal before invocation, not silently replaced',async t=>{
  const s=child(t);await s.ready();const body=Buffer.from(JSON.stringify(req(1,{text:'X'}))+'\n');body[body.indexOf(88)]=0xff;
  s.p.stdin.write(body);const done=await s.finish();assert.equal(done.error,'MCP_INVALID_UTF8');assert.equal(done.started,0);assert.equal((await s.exit).code,1);
});

test('eight real connections complete 240 calls without sharing IDs or exceeding configured handler slots',async t=>{
  const clients=Array.from({length:8},()=>child(t,{maxInFlightCalls:2}));await Promise.all(clients.map(s=>s.ready()));
  await Promise.all(clients.map(async(s,clientIndex)=>{
    for(let round=0;round<15;round++){
      s.send([req(1,{text:'client-'+clientIndex}),req('1',{text:'client-'+clientIndex})]);
      await s.wait(()=>s.lines.length===round+1);const results=s.lines[round];assert.equal(results.length,2);
      for(const r of results)assert.equal(r.result.structuredContent.text,'client-'+clientIndex);
    }
    s.end();const done=await s.finish();assert.equal(done.started,30);assert.equal(done.aborted,0);
    assert(done.report.handler.peakRunning<=2);assert(done.report.peakPending<=32);assert(done.report.output.peakBytes<=4194304);
    assert.equal((await s.exit).code,0);
  }));
});
