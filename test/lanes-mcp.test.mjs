import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {laneFixture} from './fixtures/lane-setup.mjs';
import {LaneStore,bindLaneEngine,LANE_QUEUE_DEPTH} from '../src/lanes/store.mjs';import {EngineError} from '../src/capability.mjs';import {createMcpHandler} from '../src/mcp.mjs';import {indexProject} from '../src/retrieval.mjs';
import {compileContext,tokenCount} from '../src/context.mjs';import {makeEngine} from '../src/engine.mjs';
const entry=fileURLToPath(new URL('../scripts/lanes.mjs',import.meta.url));
async function connect(home,lane){
  const client=new Client({name:'verified-protocol-client-'+lane,version:'1'});
  const transport=new StdioClientTransport({command:process.execPath,args:[entry,'mcp','--project','product','--lane',lane],env:{...process.env,BBRAINX_HOME:home},stderr:'pipe'});
  transport.stderr?.on('data',()=>{});try{await client.connect(transport);return client;}catch(e){await transport.close();throw e;}
}
const call=(client,name,args)=>client.callTool({name,arguments:{project:'product',...args}}).then(r=>r.structuredContent??r);

test('two real MCP processes use separate worktrees/checkpoints and one memory authority concurrently',async t=>{
  const f=laneFixture(t),m=f.authority.proposeMemory('product','SHARED_APPROVED_RULE: preserve the public API','ADR');f.authority.reviewMemory('product',m.id,'approved',1);
  let a,b;
  try{
    [a,b]=await Promise.all([connect(f.home,'alpha'),connect(f.home,'beta')]);
    const lists=await Promise.all([a.listTools(),b.listTools()]);for(const {tools} of lists){assert.equal(tools.length,6);assert(!tools.some(t=>/exec|shell|approve/.test(t.name)));}
    const indexed=await Promise.all([call(a,'context_index',{}),call(b,'context_index',{})]);for(const r of indexed)assert.equal(r.ok,true);
    const packs=await Promise.all([call(a,'context_bootstrap',{query:'workspaceMarker',budget:2000}),call(b,'context_bootstrap',{query:'workspaceMarker',budget:2000})]);
    assert(packs[0].data.text.includes('ALPHA_MARKER'));assert(!packs[0].data.text.includes('BETA_MARKER'));
    assert(packs[1].data.text.includes('BETA_MARKER'));assert(!packs[1].data.text.includes('ALPHA_MARKER'));
    for(const p of packs){assert(p.data.text.includes('SHARED_APPROVED_RULE'));assert.equal(p.data.payloadTokens,tokenCount(p.data.text));}
    assert.notEqual(packs[0].data.snapshot,packs[1].data.snapshot);
    const saved=await Promise.all([[a,'alpha'],[b,'beta']].map(([c,lane])=>call(c,'session_checkpoint',{task:'FEATURE',expectedVersion:0,idempotencyKey:'same-key',content:{objective:lane,nextAction:'review',status:'review_needed'}})));
    assert(saved.every(r=>r.ok));assert.equal(saved[0].data.content.objective,'alpha');assert.equal(saved[1].data.content.objective,'beta');
    const proposed=await call(a,'memory_propose',{statement:'CROSS_LANE_PROPOSAL','source':'task-alpha'});assert.equal(proposed.ok,true);
    const betaBefore=await call(b,'context_bootstrap',{query:'workspaceMarker',budget:2000});assert(!betaBefore.data.text.includes('CROSS_LANE_PROPOSAL'));
    f.authority.reviewMemory('product',proposed.data.id,'approved',1);
    const betaAfter=await call(b,'context_bootstrap',{query:'workspaceMarker',budget:2000});assert(betaAfter.data.text.includes('CROSS_LANE_PROPOSAL'));
    f.authority.reviewMemory('product',m.id,'revoked',2);
    const aAfter=await call(a,'context_bootstrap',{query:'workspaceMarker',budget:2000});assert(!aAfter.data.text.includes('SHARED_APPROVED_RULE'));
  }finally{await a?.close();await b?.close();}
});
test('A to B to A handoff within a lane preserves checkpoint without copying transcripts',async t=>{
  const f=laneFixture(t);let c;
  try{c=await connect(f.home,'alpha');await call(c,'context_index',{});const w=await call(c,'session_checkpoint',{task:'HANDOFF',expectedVersion:0,idempotencyKey:'first',content:{objective:'A',nextAction:'Continue with B',status:'paused',decisions:['DO_NOT_CHANGE_API']}});assert(w.ok);await c.close();c=await connect(f.home,'alpha');const r=await call(c,'session_get',{task:'HANDOFF'});assert.equal(r.data.checkpoint.version,1);assert.deepEqual(r.data.checkpoint.content.decisions,['DO_NOT_CHANGE_API']);assert.equal(r.data.workspace.lane,'alpha');}finally{await c?.close();}
});
test('caller cannot retarget lane or project through tool arguments',async t=>{
  const f=laneFixture(t);const c=await connect(f.home,'alpha');
  try{assert.equal((await c.callTool({name:'session_get',arguments:{project:'other',task:'X'}})).isError,true);assert.equal((await c.callTool({name:'session_get',arguments:{project:'product',lane:'beta',task:'X'}})).isError,true);}finally{await c.close();}
});
test('closed lane is refused by an already connected MCP client',async t=>{
  const f=laneFixture(t);const c=await connect(f.home,'alpha');try{const b=f.registry.active('product','alpha');f.registry.retire('product','alpha',b.epoch);const r=await call(c,'session_get',{task:'X'});assert.equal(r.ok,false);assert.equal(r.error,'LANE_NOT_ACTIVE');}finally{await c.close();}
});
test('mandatory project memories are counted at authority, never silently ignored by empty lane table',t=>{
  const f=laneFixture(t),m=f.authority.proposeMemory('product','mandatory rule '.repeat(250),'ADR');f.authority.reviewMemory('product',m.id,'approved',1);
  const s=new LaneStore(f.home,'product','alpha');try{s.beginOperation();indexProject(s,'product');assert.throws(()=>compileContext(s,{project:'product',query:'workspaceMarker',budget:256}),{code:'MANDATORY_CONTEXT_EXCEEDS_BUDGET'});}finally{s.close();}
});
test('lane context event records the approved memory revision used in the payload',t=>{
  const f=laneFixture(t),s=new LaneStore(f.home,'product','alpha');try{s.beginOperation();indexProject(s,'product');const p=compileContext(s,{project:'product',query:'workspaceMarker',budget:2000});const e=s.events('product').find(e=>e.type==='context.compiled');assert.equal(e.payload.packId,p.packId);assert.equal(e.payload.lane,'alpha');assert(p.text.includes(e.payload.memoryRevision));}finally{s.close();}
});
test('same process queues overlapping requests in arrival order instead of sharing transient memory view',async t=>{
  const f=laneFixture(t),s=new LaneStore(f.home,'product','alpha');
  try{const engine=bindLaneEngine(makeEngine(s,['product']),s),args={project:'product',task:'X'};
    let open=0,peak=0;const begin=s.beginOperation.bind(s),end=s.endOperation.bind(s);
    s.beginOperation=()=>{open++;peak=Math.max(peak,open);begin();};s.endOperation=()=>{end();open--;};
    const first=engine.invoke('session.get',args,{principal:{id:'host'}});const second=await engine.invoke('session.get',args,{principal:{id:'host'}});assert.equal(second.ok,true);assert.equal((await first).ok,true);
    const burst=await Promise.all(Array.from({length:LANE_QUEUE_DEPTH},()=>engine.invoke('session.get',args,{principal:{id:'host'}})));
    assert(burst.every(r=>r.ok===true&&r.data.workspace.lane==='alpha'),'a burst within the depth completes');
    assert.equal(peak,1,'operations of one lane process never overlap');assert.equal(open,0);
  }finally{s.close();}
});
// Controllable engine and store: deterministic ordering/cancellation checks without wall-clock races.
function gated(){
  const started=[],pending=new Map();
  const engine={list:()=>[],describe:()=>({}),invoke(id,args,{signal}={}){
    started.push(args.n);
    return new Promise((resolve,reject)=>{
      pending.set(args.n,{resolve:()=>resolve({ok:true,data:{n:args.n}}),fail:error=>reject(error)});
      signal?.addEventListener('abort',()=>reject(new EngineError('CANCELLED','Capability invocation was cancelled.')),{once:true});
    });
  }};
  return {engine,started,finish:n=>pending.get(n).resolve(),fail:(n,error)=>pending.get(n).fail(error)};
}
function stubStore(){
  const log=[];
  return {log,scopeProject:'product',binding:{id:'alpha',epoch:1,root:'/stub'},registry:{active(){}},
    beginOperation(){log.push('begin');},endOperation(){log.push('end');},workspaceMetadata:()=>({lane:'alpha'})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const principal={principal:{id:'host'}};
test('lane queue depth equals the MCP handler in-flight limit, so a harness burst is never refused by the lane first',()=>{
  const handler=createMcpHandler({name:'x',version:'1',list:()=>[],describe:()=>({}),invoke:async()=>({})},{principal:{id:'host'}});
  assert.equal(LANE_QUEUE_DEPTH,handler.stats().maxInFlightCalls);assert.equal(LANE_QUEUE_DEPTH,8);
});
test('queued calls run strictly in arrival order, one at a time, each getting its own result',async t=>{
  const g=gated(),store=stubStore(),lane=bindLaneEngine(g.engine,store);
  const calls=Array.from({length:LANE_QUEUE_DEPTH},(_,n)=>lane.invoke('x',{n},principal));
  await tick();assert.deepEqual(g.started,[0],'only the head of the queue runs');
  for(let n=0;n<LANE_QUEUE_DEPTH;n++){g.finish(n);await tick();assert.deepEqual(g.started,Array.from({length:Math.min(n+2,LANE_QUEUE_DEPTH)},(_,i)=>i));}
  const results=await Promise.all(calls);assert.deepEqual(results.map(r=>r.data.n),[0,1,2,3,4,5,6,7]);
  assert(results.every(r=>r.ok&&r.data.workspace.lane==='alpha'));
  assert.deepEqual(store.log,Array.from({length:LANE_QUEUE_DEPTH},()=>['begin','end']).flat(),'begin/end strictly alternate');
});
test('beyond the queue depth a call is refused at once with LANE_BUSY; the queue keeps its place and recovers',async t=>{
  const g=gated(),lane=bindLaneEngine(g.engine,stubStore(),{depth:3});
  const a=lane.invoke('x',{n:0},principal),b=lane.invoke('x',{n:1},principal),c=lane.invoke('x',{n:2},principal);
  const refused=await lane.invoke('x',{n:3},principal);
  assert.equal(refused.ok,false);assert.equal(refused.error,'LANE_BUSY');assert.match(refused.detail,/3/);
  await tick();assert.deepEqual(g.started,[0],'the refused call never reached the engine');
  g.finish(0);await a;g.finish(1);await b;g.finish(2);await c;
  assert.deepEqual(g.started,[0,1,2]);
  const again=lane.invoke('x',{n:4},principal);await tick();g.finish(4);assert.equal((await again).ok,true);
});
test('a call cancelled while queued never reaches the engine, frees its place and does not stall the others',async t=>{
  const g=gated(),store=stubStore(),lane=bindLaneEngine(g.engine,store,{depth:3});
  const head=lane.invoke('x',{n:0},principal),controller=new AbortController();
  const queued=lane.invoke('x',{n:1},{...principal,signal:controller.signal}),last=lane.invoke('x',{n:2},principal);
  await tick();controller.abort(new Error('client cancelled'));
  await assert.rejects(queued,{name:'EngineError',code:'CANCELLED'});
  // Its seat is free again: a fourth caller is admitted (depth 3 = head + last + this one).
  const replacement=lane.invoke('x',{n:3},principal);
  g.finish(0);await head;await tick();assert.deepEqual(g.started,[0,2],'the cancelled call was skipped, order of the rest preserved');
  g.finish(2);await last;await tick();g.finish(3);assert.equal((await replacement).data.n,3);
  assert.deepEqual(g.started,[0,2,3]);assert.equal(store.log.filter(x=>x==='begin').length,3,'no begin for the cancelled call');
  const pre=new AbortController();pre.abort();
  await assert.rejects(lane.invoke('x',{n:9},{...principal,signal:pre.signal}),{code:'CANCELLED'});assert.deepEqual(g.started,[0,2,3]);
});
test('a running call that is cancelled hands the lane to the next queued call',async t=>{
  const g=gated(),lane=bindLaneEngine(g.engine,stubStore()),controller=new AbortController();
  const running=lane.invoke('x',{n:0},{...principal,signal:controller.signal}),next=lane.invoke('x',{n:1},principal);
  await tick();controller.abort();await assert.rejects(running,{code:'CANCELLED'});await tick();
  assert.deepEqual(g.started,[0,1]);g.finish(1);assert.equal((await next).ok,true);
});
test('waiting is bounded: a call queued behind a stuck operation is refused after maxWaitMs and never runs',async t=>{
  const g=gated(),lane=bindLaneEngine(g.engine,stubStore(),{maxWaitMs:40});
  const stuck=lane.invoke('x',{n:0},principal);
  const started=performance.now(),refused=await lane.invoke('x',{n:1},principal);
  assert.equal(refused.error,'LANE_BUSY');assert.match(refused.detail,/Waited 40 ms/);assert.ok(performance.now()-started<1000);
  g.finish(0);await stuck;await tick();assert.deepEqual(g.started,[0],'the abandoned call was not executed later');
  const after=lane.invoke('x',{n:2},principal);await tick();g.finish(2);assert.equal((await after).ok,true);
});
test('an engine failure does not wedge the queue and the next call still runs',async t=>{
  const g=gated(),store=stubStore(),lane=bindLaneEngine(g.engine,store);
  const broken=lane.invoke('x',{n:0},principal),after=lane.invoke('x',{n:1},principal);
  await tick();g.fail(0,new Error('boom'));await assert.rejects(broken,{message:'boom'});await tick();
  g.finish(1);assert.equal((await after).ok,true);assert.deepEqual(store.log,['begin','end','begin','end']);
});
test('queue options are validated',()=>{
  for(const bad of [{depth:0},{depth:1.5},{depth:129},{depth:'8'},{maxWaitMs:0},{maxWaitMs:-1},{maxWaitMs:600001},{maxWaitMs:Infinity}])
    assert.throws(()=>bindLaneEngine(gated().engine,stubStore(),bad),{name:'TypeError',message:'INVALID_LANE_QUEUE_OPTIONS'});
});
test('a harness burst of parallel tool calls over real MCP stdio completes, none is refused',async t=>{
  const f=laneFixture(t);let c;
  try{c=await connect(f.home,'alpha');await call(c,'context_index',{});
    const burst=await Promise.all(Array.from({length:LANE_QUEUE_DEPTH},()=>call(c,'session_get',{task:'PAR'})));
    assert.deepEqual(burst.map(r=>r.ok),Array(LANE_QUEUE_DEPTH).fill(true));assert(burst.every(r=>r.data.workspace.lane==='alpha'));
    const mixed=await Promise.all([call(c,'context_search',{query:'workspaceMarker'}),call(c,'session_get',{task:'PAR'}),call(c,'context_index',{})]);
    assert.deepEqual(mixed.map(r=>r.ok),[true,true,true]);
  }finally{await c?.close();}
});
test('same workspace changes are observed on next bootstrap without altering another lane',async t=>{
  const f=laneFixture(t);let a,b;try{[a,b]=await Promise.all([connect(f.home,'alpha'),connect(f.home,'beta')]);await Promise.all([call(a,'context_index',{}),call(b,'context_index',{})]);
    fs.appendFileSync(path.join(f.alpha,'feature.ts'),'\nexport const workspaceMarkerNew = "ONLY_ALPHA_V2";');
    const after=await call(a,'context_bootstrap',{query:'workspaceMarker',budget:2000});assert(after.data.text.includes('ONLY_ALPHA_V2'));const untouched=await call(b,'context_bootstrap',{query:'workspaceMarker',budget:2000});assert(!untouched.data.text.includes('ONLY_ALPHA_V2'));assert(untouched.data.text.includes('BETA_MARKER'));
  }finally{await a?.close();await b?.close();}
});
