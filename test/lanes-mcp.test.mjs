import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {laneFixture} from './fixtures/lane-setup.mjs';
import {LaneStore,bindLaneEngine} from '../src/lanes/store.mjs';import {indexProject} from '../src/retrieval.mjs';
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
test('same process rejects overlapping requests instead of sharing transient memory view',async t=>{
  const f=laneFixture(t),s=new LaneStore(f.home,'product','alpha');
  try{const engine=bindLaneEngine(makeEngine(s,['product']),s),args={project:'product',task:'X'};
    const first=engine.invoke('session.get',args,{principal:{id:'host'}});const second=await engine.invoke('session.get',args,{principal:{id:'host'}});assert.equal(second.error,'LANE_BUSY');assert.equal((await first).ok,true);
  }finally{s.close();}
});
test('same workspace changes are observed on next bootstrap without altering another lane',async t=>{
  const f=laneFixture(t);let a,b;try{[a,b]=await Promise.all([connect(f.home,'alpha'),connect(f.home,'beta')]);await Promise.all([call(a,'context_index',{}),call(b,'context_index',{})]);
    fs.appendFileSync(path.join(f.alpha,'feature.ts'),'\nexport const workspaceMarkerNew = "ONLY_ALPHA_V2";');
    const after=await call(a,'context_bootstrap',{query:'workspaceMarker',budget:2000});assert(after.data.text.includes('ONLY_ALPHA_V2'));const untouched=await call(b,'context_bootstrap',{query:'workspaceMarker',budget:2000});assert(!untouched.data.text.includes('ONLY_ALPHA_V2'));assert(untouched.data.text.includes('BETA_MARKER'));
  }finally{await a?.close();await b?.close();}
});
