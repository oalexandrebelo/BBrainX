import { test } from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BrainStore } from '../src/store.mjs';
import { indexProject, search } from '../src/retrieval.mjs';
import * as context from '../src/context.mjs';
import { makeEngine } from '../src/engine.mjs';
import { compileContext, minRelevance } from '../src/context.mjs';

// Custo em tokens do que o modelo recebe de context_search: teto por orçamento, restante como ponteiros path:linhas.
const { tokenCount } = context;
function workspace(t,files){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-tok-')), root=path.join(dir,'repo');fs.mkdirSync(root);
  for(const [name,body] of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),body);}
  const store=new BrainStore(path.join(dir,'state'));store.register('test',root);indexProject(store,'test');
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {dir,root,store};
}
const filler=count=>Array.from({length:count},(_,line)=>'  const step'+line+' = value - '+line+';').join('\n');
// Dez arquivos que casam com a consulta, com 1 a 10 ocorrências: scores decrescentes e distintos; cada um custa bem mais de 400 tokens.
const ranked=()=>Object.fromEntries(Array.from({length:10},(_,i)=>['src/f'+i+'.ts','export function f'+i+'(){\n'+('  // alpha note\n'.repeat(10-i))+filler(40)+'\n}\n']));
const principal={principal:{id:'tester'}};
const json=value=>tokenCount(JSON.stringify(value));
async function withEnv(name,value,fn){const before=process.env[name];if(value===undefined)delete process.env[name];else process.env[name]=value;try{return await fn();}finally{if(before===undefined)delete process.env[name];else process.env[name]=before;}}

test('context.search through the engine is capped at 4000 tokens by default and a larger budget serves every hit',async t=>{
  const {store}=workspace(t,ranked());const engine=makeEngine(store,['test']);
  const all=search(store,'test','alpha',10);
  assert.equal(all.items.length,10);assert.ok(json(all.items)>5000,'the fixture must be far above the default budget: '+json(all.items));
  const small=await engine.invoke('context.search',{project:'test',query:'alpha',limit:10},principal);
  assert.equal(small.ok,true);
  const {items,more,omitted,truncated}=small.data;
  assert.ok(items.length>=2&&items.length<10,'served '+items.length);assert.equal(truncated,true);assert.equal(omitted,10-items.length);
  assert.deepEqual(items.map(x=>x.id),all.items.slice(0,items.length).map(x=>x.id),'the order of the ranking is kept');
  assert.ok(json(items)+json(more)<=4000,'items and pointers stay inside the budget: '+(json(items)+json(more)));
  const large=await engine.invoke('context.search',{project:'test',query:'alpha',limit:10,budget:16000},principal);
  assert.equal(large.data.items.length,10);assert.equal(large.data.omitted,0);assert.equal(large.data.more,undefined,'nothing left out, nothing to point at');
});
test('what the budget leaves out comes back as path:lines pointers, so the hit is still located',async t=>{
  const {store}=workspace(t,ranked());const engine=makeEngine(store,['test']);
  const all=search(store,'test','alpha',10).items;
  const {data}=await engine.invoke('context.search',{project:'test',query:'alpha',limit:10},principal);
  assert.equal(data.more.length,data.omitted);
  assert.deepEqual(data.more,all.slice(data.items.length).map(x=>x.path+':'+x.start_line+'-'+x.end_line),'pointers follow the ranking and name the lines');
  assert.ok(json(data.more)<=12*data.more.length,'a pointer is about ten tokens: '+json(data.more)+' for '+data.more.length);
});
test('budget is validated from 256 to 16000 and a hit larger than the budget is still served once',async t=>{
  const {store}=workspace(t,ranked());const engine=makeEngine(store,['test']);
  for(const budget of [100,255,16001,1.5,'4000'])await assert.rejects(()=>engine.invoke('context.search',{project:'test',query:'alpha',budget},principal),{code:'INPUT_INVALID'},String(budget));
  const tiny=await engine.invoke('context.search',{project:'test',query:'alpha',limit:10,budget:256},principal);
  assert.equal(tiny.data.items.length,1);assert.equal(tiny.data.omitted,9);assert.equal(tiny.data.truncated,true);
  assert.throws(()=>context.fitSearch(search(store,'test','alpha',3),100),{code:'INVALID_BUDGET'});
});
test('documentation takes at most half of the search budget while code is among the hits',t=>{
  const prose=name=>'# Retry policy '+name+'\n'+('The retry policy waits and then sends the request again. '.repeat(7)+'\n').repeat(3);
  const files={'src/again.ts':'// policy\nexport function again(call, attempts) {\n'+filler(24)+'\n  return attempts > 0 ? call() : null;\n}\n'};
  for(const name of ['a','b','c','d','e','f'])files['docs/'+name+'.md']=prose(name);
  const {store}=workspace(t,files);
  const found=search(store,'test','retry policy request',10), served=context.fitSearch(found,1500);
  assert.ok(found.items.slice(0,6).every(item=>item.kind==='doc'),'the fixture needs the documents to outrank the code');
  assert.ok(served.items.some(item=>item.path==='src/again.ts'),'the code must be among the hits that were served');
  assert.ok(json(served.items.filter(item=>item.kind==='doc'))<=750,'documents stay inside half of the budget');
});
test('the command line search obeys --budget as the tool does',t=>{
  const {dir}=workspace(t,ranked());
  const run=(...args)=>{const result=spawnSync(process.execPath,[fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url)),'search','--project','test','--query','alpha',...args],{encoding:'utf8',env:{...process.env,BBRAINX_HOME:path.join(dir,'state')}});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);};
  const small=run('--budget','256'), standard=run(), large=run('--budget','16000');
  assert.equal(small.items.length,1);assert.equal(small.omitted,9);assert.ok(standard.items.length>small.items.length&&standard.items.length<10);assert.equal(large.items.length,10);
});

// ── pacote de contexto: cabeçalho curto e piso de relevância ───────────────
test('the pack header carries a 12-hex file hash that is a prefix of the full hash in sources',t=>{
  const {store}=workspace(t,ranked());const pack=compileContext(store,{project:'test',query:'alpha',budget:2000});
  const headers=[...pack.text.matchAll(/^---\n(\S+):(\d+)-(\d+) \[sha256:([0-9a-f]+)\]$/gm)];
  assert.equal(headers.length,pack.sources.length);assert.ok(headers.length>0);
  headers.forEach((header,i)=>{assert.equal(header[4].length,12);assert.equal(pack.sources[i].hash.length,64);assert.ok(pack.sources[i].hash.startsWith(header[4]));});
  assert.equal(pack.payloadTokens,tokenCount(pack.text));
});
test('the relevance floor drops the low-score tail but never the best code or the best document',async t=>{
  const files={...ranked(),'docs/alpha.md':'# alpha\nalpha note.\n'};
  const {store}=workspace(t,files);
  const open=await withEnv('BBRAINX_PACK_MIN_RELEVANCE','0',()=>compileContext(store,{project:'test',query:'alpha',budget:16000}));
  const strict=await withEnv('BBRAINX_PACK_MIN_RELEVANCE','1',()=>compileContext(store,{project:'test',query:'alpha',budget:16000}));
  assert.equal(open.sourcesOmittedByRelevance,0);assert.ok(open.sources.length>strict.sources.length);
  assert.equal(strict.sourcesOmittedByRelevance,open.sources.length-strict.sources.length);
  assert.ok(strict.sources.some(x=>x.kind==='doc'),'the best document survives the floor');
  assert.ok(strict.sources.some(x=>x.kind!=='doc'),'the best code section survives the floor');assert.ok(strict.sources.length>=2,'the two best sections always enter');
  assert.ok(strict.payloadTokens<open.payloadTokens);
});
test('the relevance floor comes from the host and must be a number from 0 to 1',async t=>{
  const {store}=workspace(t,ranked());
  assert.equal(minRelevance({}),0.3);assert.equal(minRelevance({BBRAINX_PACK_MIN_RELEVANCE:''}),0.3);assert.equal(minRelevance({BBRAINX_PACK_MIN_RELEVANCE:'0'}),0);
  for(const bad of ['2','-0.1','abc'])await withEnv('BBRAINX_PACK_MIN_RELEVANCE',bad,()=>assert.throws(()=>compileContext(store,{project:'test',query:'alpha'}),{code:'INVALID_LIMIT'},bad));
});

// ── esquemas anunciados em tools/list ──────────────────────────────────────
test('identifier format is enforced by the server without being repeated as a pattern in every tool schema',async t=>{
  const {store}=workspace(t,ranked());const engine=makeEngine(store,['test']);
  for(const id of ['bad id','-lead','_lead','a/b','x'.repeat(81),''])await assert.rejects(()=>engine.invoke('session.get',{project:'test',task:id},principal),{code:'INPUT_INVALID'},JSON.stringify(id));
  assert.equal((await engine.invoke('session.get',{project:'test',task:'A.b-c_9'},principal)).ok,true);
  assert.equal((await engine.invoke('session.get',{project:'test',task:'x'.repeat(80)},principal)).ok,true);
  for(const {id} of engine.list()){
    const text=JSON.stringify(engine.describe(id));
    assert.ok(!text.includes('"pattern"'),id+' still advertises a pattern');assert.ok(!text.includes('$defs'),id+' still advertises a recursive output schema');
    assert.equal(engine.describe(id).outputSchema.type,'object');
  }
});

// ── um acerto por arquivo ──────────────────────────────────────────────────
// big.ts tem três trechos de 60 linhas que casam com a consulta; os outros quatro arquivos têm um trecho cada.
const multiChunk=()=>{
  const lines=(count,mark,every)=>Array.from({length:count},(_,i)=>i%every===0?'  // alpha '+mark+i:'  const step'+mark+i+' = value - '+i+';');
  return {'src/big.ts':[...lines(60,'a',3),...lines(60,'b',4),...lines(30,'c',10)].join('\n')+'\n',
    ...Object.fromEntries(Array.from({length:4},(_,i)=>['src/small'+i+'.ts','export function small'+i+'(){\n  // alpha once\n'+filler(6)+'\n}\n']))};
};
test('search returns one hit per file and lists the other relevant chunks of that file as line ranges',t=>{
  const {store}=workspace(t,multiChunk());
  const raw=search(store,'test','alpha',10,{byFile:false}).items, hits=search(store,'test','alpha',10).items;
  assert.ok(raw.filter(x=>x.path==='src/big.ts').length>=3,'the fixture needs three chunks of one file among the hits');
  assert.equal(new Set(hits.map(x=>x.path)).size,hits.length,'no file occupies two slots');
  assert.equal(hits.length,new Set(raw.map(x=>x.path)).size);
  const big=hits.find(x=>x.path==='src/big.ts'), chunks=raw.filter(x=>x.path==='src/big.ts');
  assert.equal(big.id,chunks[0].id,'the hit is the best chunk of the file');
  assert.deepEqual(big.also,chunks.slice(1,3).map(x=>x.start_line+'-'+x.end_line),'the others come as ranges, best first, without their bodies');
  assert.ok(hits.filter(x=>x.path!=='src/big.ts').every(x=>x.also===undefined),'a file with a single chunk has no also');
  assert.deepEqual(hits.map(x=>x.path),[...new Set(raw.map(x=>x.path))],'the order of the files is the order of their best chunk');
});
test('limit counts files, and the raw chunk list stays available for the context pack',t=>{
  const {store}=workspace(t,multiChunk());
  assert.equal(search(store,'test','alpha',3).items.length,3);assert.equal(new Set(search(store,'test','alpha',3).items.map(x=>x.path)).size,3);
  assert.equal(search(store,'test','alpha',3,{byFile:false}).items.length,3);
  const pack=compileContext(store,{project:'test',query:'alpha',budget:16000});
  assert.ok(pack.sources.filter(x=>x.path==='src/big.ts').length>=2,'the pack keeps several chunks of the same file');
});
test('context.search through the engine returns distinct files with their also ranges',async t=>{
  const {store}=workspace(t,multiChunk());const engine=makeEngine(store,['test']);
  const {data}=await engine.invoke('context.search',{project:'test',query:'alpha',limit:10,budget:16000},principal);
  assert.equal(new Set(data.items.map(x=>x.path)).size,data.items.length);
  assert.equal(data.items.find(x=>x.path==='src/big.ts').also.length,2);
});
