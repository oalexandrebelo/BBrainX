import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BrainStore } from '../src/store.mjs';
import { indexProject } from '../src/retrieval.mjs';
import { makeEngine } from '../src/engine.mjs';
import { hash } from '../src/primitives.mjs';
import { laneFixture } from './fixtures/lane-setup.mjs';
import { LaneStore, bindLaneEngine } from '../src/lanes/store.mjs';

const principal={principal:{id:'test-host'}};
function fixture(t,{indexed=true}={}){
  const dir=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-aci-'))),root=path.join(dir,'repo');fs.mkdirSync(root);
  const body=Array.from({length:500},(_,i)=>i===449?'export function targetSymbol() { return 1; }':`// linha ${i+1}`).join('\n')+'\n';
  fs.writeFileSync(path.join(root,'code.mjs'),body);
  fs.writeFileSync(path.join(root,'calls.mjs'),'targetSymbol();\nexport function targetSymbolExtra() { return targetSymbol(); }\n');
  fs.writeFileSync(path.join(root,'README.md'),'# targetSymbol\n');
  const store=new BrainStore(path.join(dir,'state'));store.register('app',root);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  if(indexed)indexProject(store,'app');const engine=makeEngine(store,['app']);
  const call=(id,args={})=>engine.invoke('context.'+id,{project:'app',...args},principal);
  return {dir,root,store,engine,call,body};
}
test('ACI read: numbered inclusive window, exact file hash, EOF and 400-line maximum',async t=>{
  const f=fixture(t),r=await f.call('read',{path:'code.mjs',start:449,end:451});assert(r.ok,r.error);
  assert.equal(r.data.text,'   449| // linha 449\n   450| export function targetSymbol() { return 1; }\n   451| // linha 451');
  assert.equal(r.data.hash,hash(f.body));assert.equal(r.data.start,449);assert.equal(r.data.end,451);assert.equal(r.data.totalLines,500);assert.equal(r.data.freshness.status,'current');
  const max=await f.call('read',{path:'code.mjs',start:101,end:500});assert(max.ok);assert.equal(max.data.text.split('\n').length,400);
  const eof=await f.call('read',{path:'code.mjs',start:499,end:510});assert(eof.ok);assert.equal(eof.data.end,500);assert.equal(eof.data.text.split('\n').length,2);
  for(const range of [{start:1,end:401},{start:5,end:4},{start:501,end:510}])assert.equal((await f.call('read',{path:'code.mjs',...range})).error,'INVALID_READ_RANGE');
  for(const range of [{start:0},{start:1.5},{end:0}])await assert.rejects(()=>f.call('read',{path:'code.mjs',...range}));
});
test('ACI read: blank files, CRLF and byte bounds are explicit',async t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'empty.txt'),'');fs.writeFileSync(path.join(f.root,'crlf.txt'),'a\r\nb\r\n');fs.writeFileSync(path.join(f.root,'long.txt'),'x'.repeat(70000));indexProject(f.store,'app');
  const empty=await f.call('read',{path:'empty.txt'});assert(empty.ok);assert.equal(empty.data.totalLines,0);assert.equal(empty.data.text,'');assert.equal(empty.data.end,0);
  const crlf=await f.call('read',{path:'crlf.txt'});assert.equal(crlf.data.text,'     1| a\n     2| b');
  assert.equal((await f.call('read',{path:'long.txt'})).error,'READ_WINDOW_TOO_LARGE');
});
test('ACI: traversal, absolute paths, symlinks and files outside the index are refused',async t=>{
  const f=fixture(t);
  for(const p of ['../outside.txt','sub/../code.mjs','./code.mjs','sub//code.mjs','/etc/passwd','C:\\outside.txt','C:outside.txt','\\\\host\\share','sub\\..\\code.mjs','bad\0.txt']){
    assert.equal((await f.call('read',{path:p})).error,'UNSAFE_PATH',p);
    assert.equal((await f.call('symbol',{symbol:'targetSymbol',path:p})).error,'UNSAFE_PATH',p);
  }
  fs.writeFileSync(path.join(f.root,'.env'),'private');fs.symlinkSync(path.join(f.root,'code.mjs'),path.join(f.root,'link.mjs'),'file');indexProject(f.store,'app');
  for(const p of ['.env','link.mjs','missing.mjs'])assert.equal((await f.call('read',{path:p})).error,'FILE_NOT_INDEXED');
  assert.equal((await f.call('symbol',{symbol:'targetSymbol',path:'link.mjs'})).error,'FILE_NOT_INDEXED');
  fs.unlinkSync(path.join(f.root,'code.mjs'));fs.symlinkSync(path.join(f.root,'calls.mjs'),path.join(f.root,'code.mjs'),'file');
  assert.equal((await f.call('read',{path:'code.mjs'})).error,'INDEX_STALE');
});
test('ACI: missing and stale indexes refuse both capabilities without implicit refresh',async t=>{
  const f=fixture(t,{indexed:false});
  for(const [id,args] of [['read',{path:'code.mjs'}],['symbol',{symbol:'targetSymbol'}]])assert.equal((await f.call(id,args)).error,'INDEX_REQUIRED');
  const indexed=indexProject(f.store,'app');fs.appendFileSync(path.join(f.root,'calls.mjs'),'// unrelated file also invalidates freshness\n');
  for(const [id,args] of [['read',{path:'code.mjs'}],['symbol',{symbol:'targetSymbol'}]])assert.equal((await f.call(id,args)).error,'INDEX_STALE');
  assert.equal(f.store.project('app').snapshot,indexed.snapshot);indexProject(f.store,'app');assert((await f.call('read',{path:'code.mjs'})).ok);
});
test('ACI symbol: only exact indexed declarations, stable file/line/kind/hash and bounded results',async t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'types.ts'),'export class targetSymbol {}\nexport interface otherType {}\n');indexProject(f.store,'app');
  const result=await f.call('symbol',{symbol:'targetSymbol'});assert(result.ok,result.error);
  assert.deepEqual(result.data.items.map(({path,startLine,endLine,kind})=>({path,startLine,endLine,kind})),[
    {path:'code.mjs',startLine:450,endLine:450,kind:'function'}, {path:'types.ts',startLine:1,endLine:1,kind:'class'}]);
  assert.equal(result.data.items[0].hash,hash(f.body));assert.equal(result.data.truncated,false);
  const limited=await f.call('symbol',{symbol:'targetSymbol',limit:1});assert.equal(limited.data.items.length,1);assert.equal(limited.data.truncated,true);
  const scoped=await f.call('symbol',{symbol:'targetSymbol',path:'types.ts'});assert.deepEqual(scoped.data.items.map(x=>x.path),['types.ts']);
  const missing=await f.call('symbol',{symbol:'noSuchSymbol'});assert.deepEqual(missing.data.items,[]);
  for(const args of [{symbol:'targetSymbol',limit:51},{symbol:'targetSymbol',limit:0},{symbol:'" OR *'},{symbol:'x'.repeat(129)}])await assert.rejects(()=>f.call('symbol',args));
});
test('ACI symbol: candidate ceiling reports truncation even when candidates are only identifier parts',async t=>{
  const f=fixture(t);
  for(let i=0;i<201;i++)fs.writeFileSync(path.join(f.root,`candidate-${String(i).padStart(3,'0')}.mjs`),'export function wantedPart() {}\n');
  fs.writeFileSync(path.join(f.root,'z-last.mjs'),'export function wanted() {}\n');indexProject(f.store,'app');
  const capped=await f.call('symbol',{symbol:'wanted'});assert(capped.ok);assert.deepEqual(capped.data.items,[]);assert.equal(capped.data.truncated,true);
  const narrowed=await f.call('symbol',{symbol:'wanted',path:'z-last.mjs'});assert(narrowed.ok);assert.equal(narrowed.data.items.length,1);assert.equal(narrowed.data.truncated,false);
});
for(const id of ['read','symbol'])test(`ACI ${id}: hash is verified again after the freshness scan`,async t=>{
  const f=fixture(t),original=f.store.stmt.bind(f.store);let changed=false;
  f.store.stmt=sql=>{if(!changed&&sql.startsWith('SELECT hash,kind FROM files')){changed=true;fs.appendFileSync(path.join(f.root,'code.mjs'),'// changed during read\n');}return original(sql);};
  const result=await f.call(id,id==='read'?{path:'code.mjs'}:{symbol:'targetSymbol'});assert(changed);assert.equal(result.error,'INDEX_STALE');assert.equal(result.data,null);
});
test('ACI: host allowlist and lane bindings apply to both capabilities',async t=>{
  const f=fixture(t);
  for(const [id,args] of [['read',{path:'code.mjs'}],['symbol',{symbol:'targetSymbol'}]])await assert.rejects(()=>f.engine.invoke('context.'+id,{project:'foreign',...args},principal));
  const lanes=laneFixture(t),store=new LaneStore(lanes.home,'product','alpha');t.after(()=>store.close());
  const engine=bindLaneEngine(makeEngine(store,['product']),store);assert((await engine.invoke('context.index',{project:'product'},principal)).ok);
  const symbols=await engine.invoke('context.symbol',{project:'product',symbol:'workspaceMarker'},principal);assert(symbols.ok);assert.equal(symbols.data.workspace.lane,'alpha');
  assert(symbols.data.items.length);
  const read=await engine.invoke('context.read',{project:'product',path:symbols.data.items[0].path},principal);assert(read.ok);assert(read.data.text.includes('ALPHA_MARKER'));assert(!read.data.text.includes('BETA_MARKER'));
  await assert.rejects(()=>engine.invoke('context.read',{project:'product',path:symbols.data.items[0].path,lane:'beta'},principal));
});
test('ACI: real MCP stdio exposes nine default tools and both read-only capabilities',async t=>{
  const f=fixture(t),client=new Client({name:'aci-proof',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url)),'mcp','--project','app'],cwd:f.root,env:{...process.env,BBRAINX_HOME:f.store.home},stderr:'pipe'});
  transport.stderr?.on('data',()=>{});t.after(()=>client.close());await client.connect(transport);
  const {tools}=await client.listTools();assert.equal(tools.length,9);
  for(const name of ['context_read','context_symbol'])assert.equal(tools.find(x=>x.name===name).annotations.readOnlyHint,true);
  const symbols=await client.callTool({name:'context_symbol',arguments:{project:'app',symbol:'targetSymbol'}});assert(symbols.structuredContent.ok);
  const read=await client.callTool({name:'context_read',arguments:{project:'app',path:'code.mjs',start:450,end:450}});assert(read.structuredContent.ok);assert.match(read.structuredContent.data.text,/^   450\| /);
});
