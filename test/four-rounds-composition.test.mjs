import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { composeCapabilityLibraries } from '../src/capability-composition.mjs';
import { createEngine } from '../src/capability.mjs';
import { createMcpHandler, toolCatalog } from '../src/mcp.mjs';
import { runEngineCli } from '../src/engine-cli.mjs';
import { library, engine, textCapability } from './fixtures/contract-engine.mjs';
const fail = (fn, code) => assert.throws(fn, { code });
const sink = () => { let text = ''; return { stream: new Writable({write(chunk, _, done) { text += chunk; done(); }}), text: () => text }; };
const cli = async (argv, body = '{}', options = {}) => {
  const out = sink(), err = sink();
  const code = await runEngineCli(engine(), { argv, principal: { id: 'host' }, input: Readable.from([Buffer.from(body)]),
    output: out.stream, error: err.stream, ...options });
  return { code, out: out.text(), err: err.text() };
};

test('library selection and rename preserve one invocation path across direct CLI and MCP', async () => {
  const e = createEngine({ name:'test', version:'1', libraries:[{ library, rename:{ 'text.length':'inspect.length' } }] });
  const direct = await e.invoke('inspect.length', {text:'ação😀'}, {principal:{id:'host'}});
  const h = createMcpHandler(e, {principal:{id:'host'}});
  const mcp = await h.handle({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'inspect_length',arguments:{text:'ação😀'}}});
  assert.deepEqual(mcp.result.structuredContent,direct); assert.equal(direct.length,5);
  assert.equal(e.provenance()[0].originalId,'text.length');
  assert.equal(e.list()[0].id,'inspect.length');
});
test('duplicate effective IDs cannot be hidden by object spread', () => {
  fail(() => composeCapabilityLibraries([{library}], {'text.length':textCapability()}),'CAPABILITY_COLLISION');
});
test('a transport name collision is distinct from a capability collision', () => {
  const e=createEngine({name:'x',version:'1',libraries:[{library,rename:{'text.length':'text_length'}}],capabilities:{'text.length':textCapability()}});
  assert.throws(()=>toolCatalog(e), /same MCP tool name/);
});
for (const [selection, code] of [
  [{library, include:['missing']},'CAPABILITY_NOT_EXPORTED'],
  [{library, include:['text.length','text.length']},'DUPLICATE_SELECTION'],
  [{library, include:[], rename:{'text.length':'x'}},'INVALID_RENAME'],
  [{library, rename:{'text.length':'../../unsafe'}},'INVALID_RENAME'],
  [{library, arbitrary:1},'UNKNOWN_SELECTION_FIELD']
]) test('invalid library selection is refused: '+code,()=>fail(()=>composeCapabilityLibraries([selection]),code));
test('library identity is unique and empty explicit selection is empty',()=>{
  fail(()=>composeCapabilityLibraries([{library},{library}]),'DUPLICATE_LIBRARY');
  assert.equal(Object.keys(composeCapabilityLibraries([{library,include:[]}]).capabilities).length,0);
});
test('composition does not execute getters or proxy traps',()=>{
  let observed=0;
  const getter=Object.defineProperty({},'library',{enumerable:true,get(){observed++;return library;}});
  fail(()=>composeCapabilityLibraries([getter]),'ACCESSOR_IN_COMPOSITION');
  const proxy=new Proxy({}, {ownKeys(){observed++;return [];}});
  fail(()=>composeCapabilityLibraries([],proxy),'INVALID_COMPOSITION_RECORD');
  const array=[];Object.defineProperty(array,0,{get(){observed++;return {library};}});
  fail(()=>composeCapabilityLibraries(array),'ACCESSOR_IN_COMPOSITION');
  assert.equal(observed,0);
});
test('post-composition map edits and returned provenance cannot replace the captured action',async()=>{
  const original=textCapability(), local={name:'isolated',version:'1.0.0',capabilities:{a:original}};
  const e=createEngine({name:'x',version:'1',libraries:[{library:local}]});
  original.run=()=>({length:900});local.capabilities.a=textCapability();
  e.provenance()[0].source='mutated';
  assert.equal((await e.invoke('a',{text:'x'},{principal:{id:'host'}})).length,1);
  assert.equal(e.provenance()[0].source,'isolated');
});
test('selection alone never grants authentication',async()=>{
  await assert.rejects(engine().invoke('text.length',{text:'x'}),{code:'UNAUTHENTICATED'});
});
test('CLI list and describe do not read stdin or invoke the capability',async()=>{
  for(const args of [['list'],['describe','text.length']]){
    const r=await cli(args,'invalid-json');assert.equal(r.code,0);assert.equal(r.err,'');assert(r.out.includes('text.length'));
  }
});
test('real CLI child and direct invocation have the same Unicode result',()=>{
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('./fixtures/contract-engine.mjs',import.meta.url)),'run','text.length','--stdin'],{input:'{"text":"á😀"}',encoding:'utf8',timeout:5000});
  assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{length:2});
});
test('CLI refuses invalid JSON and malformed UTF8 without treating bytes as replacement characters',async()=>{
  assert.equal((await cli(['run','text.length','--stdin'],'{')).code,2);
  assert.equal((await cli(['run','text.length','--stdin'],Buffer.from([0xc3,0x28]))).code,2);
});
test('CLI requires explicit host identity and does not read identity from input',async()=>{
  assert.equal((await cli(['list'],'{}',{principal:undefined})).code,2);
  assert.equal((await cli(['run','text.length','--stdin'],'{"text":"x"}',{principal:null})).code,1);
});
test('CLI rejects unsupported arguments without running work',async()=>{
  assert.equal((await cli(['run','text.length','--input','{}'])).code,2);
});
test('CLI bounds input bytes and input wait',async()=>{
  assert.equal((await cli(['run','text.length','--stdin'],'x'.repeat(200),{maxBytes:128})).code,1);
  const stream=new Readable({read(){}});
  const r=await cli(['run','text.length','--stdin'],'',{input:stream,deadlineMs:15});
  assert.equal(r.code,1);assert.equal(stream.listenerCount('data'),0);stream.destroy();
});
test('CLI waits for actual output completion and handles asynchronous write failure',async()=>{
  let finished=false;const output=new Writable({write(_,__,done){setTimeout(()=>{finished=true;done();},15);}});
  assert.equal((await cli(['list'],'{}',{output})).code,0);assert(finished);
  const broken=new Writable({write(_,__,done){done(new Error('DO_NOT_LEAK_SECRET'));}});
  const r=await cli(['list'],'{}',{output:broken});assert.equal(r.code,1);assert(!r.err.includes('SECRET'));
});
test('CLI captures principal before asynchronous input is consumed',async()=>{
  const p={id:'host'}, s=new Readable({read(){}}), output=sink(), error=sink();
  const work=runEngineCli(engine(),{argv:['run','text.length','--stdin'],principal:p,input:s,output:output.stream,error:error.stream});
  p.id='';s.push('{"text":"x"}');s.push(null);
  assert.equal(await work,0);assert.deepEqual(JSON.parse(output.text()),{length:1});
});
test('CLI returns nonzero when a host-defined domain refusal is structurally valid',async()=>{
  assert.equal((await cli(['run','text.length','--stdin'],'{"text":"x"}',{isFailure:()=>true})).code,1);
});
