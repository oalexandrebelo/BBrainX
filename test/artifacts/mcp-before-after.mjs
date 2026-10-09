import test from 'node:test';import assert from 'node:assert/strict';
import {createEngine} from '../../src/capability.mjs';import {createMcpHandler} from '../../src/mcp.mjs';
import {textCapability} from '../fixtures/contract-engine.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
const call=id=>({jsonrpc:'2.0',id,method:'tools/call',params:{name:'work',arguments:{text:'x'}}});
function setup(){
 const starts=[],complete=[],cap=textCapability();cap.run=({context})=>{starts.push(context.signal);return new Promise(resolve=>complete.push(()=>resolve({length:1})));};
 const engine=createEngine({name:'probe',version:'1',capabilities:{work:cap}});
 return {starts,complete,handler:createMcpHandler(engine,{principal:{id:'host'},maxInFlightCalls:1})};
}
test('bounded MCP invocation admission is enforced before the second capability starts',async()=>{
 const s=setup(),a=s.handler.handle(call(1)),b=s.handler.handle(call(2));
 try{await tick();assert.equal(s.starts.length,1,'only one capability may start');}
 finally{for(const resolve of s.complete)resolve();s.handler.cancelAll();await Promise.allSettled([a,b]);}
});
test('duplicate MCP ID cannot steal cancellation from its original invocation',async()=>{
 const s=setup(),a=s.handler.handle(call('same'));await tick();const b=s.handler.handle(call('same'));
 try{await tick();await s.handler.handle({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:'same'}});
  assert.equal(s.starts[0].aborted,true,'the original cancellation target must remain reachable');}
 finally{for(const resolve of s.complete)resolve();s.handler.cancelAll();await Promise.allSettled([a,b]);}
});
