import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fixture=fileURLToPath(new URL('./fixtures/mcp-ownership-server.mjs',import.meta.url));
const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}};
const request=(id,method,params={})=>({jsonrpc:'2.0',id,method,params});
const work=(id,label,modern=false)=>request(id,'tools/call',{name:'ownership_work',arguments:{label},...(modern?{_meta:meta}:{})});
const cancel=id=>({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:id}});

function start(t){
  const child=spawn(process.execPath,[fixture],{stdio:['pipe','pipe','pipe','ipc']});
  const responses=[],events=[],waiters=new Set();let buffer='',stderr='';
  const notify=()=>{for(const waiter of [...waiters])waiter();};
  child.stdout.setEncoding('utf8').on('data',chunk=>{
    buffer+=chunk;for(let at=buffer.indexOf('\n');at!==-1;at=buffer.indexOf('\n')){
      responses.push(JSON.parse(buffer.slice(0,at)));buffer=buffer.slice(at+1);
    }notify();
  });
  child.stderr.setEncoding('utf8').on('data',chunk=>{stderr+=chunk;});
  child.on('message',event=>{events.push(event);notify();});
  const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{resolve({code,signal});notify();});});
  t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
  const wait=predicate=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{waiters.delete(check);reject(new Error('Timed out waiting for fixture; stderr: '+stderr));},5000);
    function check(){const result=predicate();if(result!==undefined){clearTimeout(timer);waiters.delete(check);resolve(result);}}
    waiters.add(check);check();
  });
  return {responses,events,send(...messages){child.stdin.write(messages.map(message=>JSON.stringify(message)+'\n').join(''));},
    event:(type,label)=>wait(()=>events.find(event=>event.type===type&&event.label===label)),
    settled:label=>wait(()=>events.find(event=>['completed','aborted'].includes(event.type)&&event.label===label)),
    response:id=>wait(()=>responses.find(response=>response.id===id)),
    batch:()=>wait(()=>responses.find(Array.isArray)),
    async inspect(id){this.send(request(id,'tools/call',{name:'ownership_inspect',arguments:{}}));return (await this.response(id)).result.structuredContent;},
    async end(){child.stdin.end();const result=await wait(()=>child.exitCode!==null?child.exitCode:undefined);assert.equal(result,0);await exited;assert.equal(stderr,'');assert.equal(buffer,'');},
    /** Duplicata ativa é violação de protocolo: a conexão termina sem resposta competidora com o mesmo ID. */
    async fatal(){const {code}=await exited;assert.equal(code,1);assert.equal(stderr,'');assert.equal(buffer,'');
      assert.deepEqual(events.filter(event=>event.type==='transport').map(event=>event.label),['MCP_DUPLICATE_REQUEST_ID']);
      const of=type=>events.filter(event=>event.type===type).map(event=>event.label);return {started:of('started'),completed:of('completed'),aborted:of('aborted')};}
  };
}

for(const modern of [false,true])test('ownership: duplicate active tool ID cannot steal cancellation ('+(modern?'modern':'legacy')+')',async t=>{
  const server=start(t);server.send(work('active','first',modern));await server.event('started','first');
  server.send(work('active','duplicate',modern),cancel('active'));
  const ledger=await server.fatal();
  assert.deepEqual(ledger.started,['first'],'a duplicate must never reach the engine');
  assert.deepEqual(ledger.completed,[],'the original cooperative operation must stop without its completion effect');
  assert.deepEqual(ledger.aborted,['first']);
  assert.equal(server.responses.filter(response=>response.id==='active').length,0,'no reply may correlate with the original request');
});

test('ownership: a different method cannot reuse an active tool ID',async t=>{
  const server=start(t);server.send(work(0,'first'));await server.event('started','first');
  server.send(request(0,'ping'),cancel(0));
  const ledger=await server.fatal();
  assert.deepEqual(ledger.completed,[]);assert.deepEqual(ledger.aborted,['first']);
  assert.equal(server.responses.filter(response=>response.id===0).length,0);
});

test('ownership: closing input cancels the original owner despite a duplicate',async t=>{
  const server=start(t);server.send(work('active','first'));await server.event('started','first');
  server.send(work('active','duplicate'));
  const ledger=await server.fatal();
  assert.deepEqual(ledger.completed,[]);assert.deepEqual(ledger.aborted,['first']);assert.deepEqual(ledger.started,['first']);
});

test('ownership: duplicate IDs in one batch reject the whole frame before any invocation',async t=>{
  const server=start(t);server.send([work(42,'first',true),work(42,'duplicate'),request('independent','ping')]);
  const ledger=await server.fatal();
  assert.deepEqual(ledger.started,[],'no member of an ambiguous batch is executed');
  assert.deepEqual(server.responses,[],'no partial batch reply');
});

test('ownership: typed IDs remain independent and unknown or late cancellation is harmless',async t=>{
  const server=start(t);server.send(work(1,'number'),work('1','string',true));
  await Promise.all([server.event('started','number'),server.event('started','string')]);
  server.send(cancel('unknown'),cancel(1));
  assert.equal((await server.response('1')).result.structuredContent.label,'string');
  server.send(cancel('1'),work('next','next'));await server.response('next');
  const ledger=await server.inspect('inspection');
  assert.deepEqual(ledger.aborted,['number']);assert.deepEqual(ledger.completed,['string','next']);
  assert.equal(server.responses.some(response=>response.id===1),false);await server.end();
});

test('ownership: modern ID can be reused after its response and per-request era remains intact',async t=>{
  const server=start(t);server.send(request('reuse','server/discover',{_meta:meta}));
  assert.equal((await server.response('reuse')).result.resultType,'complete');
  server.responses.length=0;server.send(work('reuse','reused',true));
  const response=await server.response('reuse');assert.equal(response.result.resultType,'complete');assert.equal(response.result.structuredContent.label,'reused');
  server.send(request('legacy','ping'));assert.deepEqual((await server.response('legacy')).result,{});await server.end();
});
