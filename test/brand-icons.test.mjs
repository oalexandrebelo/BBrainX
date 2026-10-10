import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createEngine,defineCapability} from '../src/capability.mjs';
import {createMcpHandler,MAX_ICON_BYTES} from '../src/mcp.mjs';
import {MCP_ICONS,serverBrand} from '../src/brand.mjs';
import {BrainStore} from '../src/store.mjs';
import {laneFixture} from './fixtures/lane-setup.mjs';

const file=name=>fileURLToPath(new URL('../'+name,import.meta.url));
const engine=()=>createEngine({name:'probe',version:'1.0.0',capabilities:{echo:defineCapability({description:'probe',input:z.object({}).strict(),output:z.object({}).strict(),access:'public',run:()=>({})})}});
const modernMeta={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}};
const SERVER_INFO='io.modelcontextprotocol/serverInfo', PNG='data:image/png;base64,';
function pngSize(bytes){
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10],'PNG signature');assert.equal(bytes.subarray(12,16).toString('latin1'),'IHDR');
  return bytes.readUInt32BE(16)+'x'+bytes.readUInt32BE(20);
}

test('brand: MCP icons are the committed PNGs, raster-only and inside the byte budget',()=>{
  assert.deepEqual(MCP_ICONS.map(icon=>icon.sizes),[['32x32'],['128x128']]);
  let total=0;
  for(const [icon,name] of [[MCP_ICONS[0],'public/brand/icon-32.png'],[MCP_ICONS[1],'public/brand/icon-128.png']]){
    assert.equal(icon.mimeType,'image/png');assert.ok(icon.src.startsWith(PNG));
    const bytes=Buffer.from(icon.src.slice(PNG.length),'base64');
    assert.deepEqual(bytes,fs.readFileSync(file(name)),name+' is the announced icon');
    assert.equal(pngSize(bytes),icon.sizes[0]);
    total+=icon.src.length;
  }
  assert.ok(total<=MAX_ICON_BYTES,'icons travel at every session start: '+total+' > '+MAX_ICON_BYTES);
});

test('brand: icons are announced once per session, never on tool traffic',async()=>{
  const handler=createMcpHandler(engine(),{serverMetadata:serverBrand('alpha')}), lean={name:'probe',version:'1.0.0'}, introduced={title:'BBrainX · alpha',icons:structuredClone(MCP_ICONS),...lean};
  const hello=await handler.handle({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});
  assert.deepEqual(hello.result.serverInfo,introduced);
  assert.ok(!JSON.stringify(await handler.handle({jsonrpc:'2.0',id:2,method:'tools/list'})).includes('data:image'),'legacy tools/list carries no icon bytes');
  assert.ok(!JSON.stringify(await handler.handle({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'echo',arguments:{}}})).includes('data:image'),'legacy tool results carry no icon bytes');
  const discovered=await handler.handle({jsonrpc:'2.0',id:4,method:'server/discover',params:{_meta:modernMeta}});
  assert.deepEqual(discovered.result._meta[SERVER_INFO],introduced);
  const listed=await handler.handle({jsonrpc:'2.0',id:5,method:'tools/list',params:{_meta:modernMeta}});
  assert.deepEqual(listed.result._meta[SERVER_INFO],lean,'modern responses repeat serverInfo, so they stay lean');
  const called=await handler.handle({jsonrpc:'2.0',id:6,method:'tools/call',params:{name:'echo',arguments:{},_meta:modernMeta}});
  assert.deepEqual(called.result._meta[SERVER_INFO],lean);
  hello.result.serverInfo.icons[0].sizes.push('mutated');
  assert.deepEqual((await handler.handle({jsonrpc:'2.0',id:7,method:'initialize',params:{}})).result.serverInfo.icons,structuredClone(MCP_ICONS),'a reply cannot mutate the next one');
  const plain=createMcpHandler(engine());
  assert.deepEqual((await plain.handle({jsonrpc:'2.0',id:8,method:'initialize',params:{}})).result.serverInfo,lean,'other engines are not branded');
});

test('brand: invalid presentation declarations fail at startup instead of being sent',()=>{
  const icon=(src,mimeType='image/png',sizes=['32x32'])=>({src,mimeType,sizes});
  const invalid=['x',[],[icon('https://example.com/i.png')],[icon('file:///tmp/i.png')],
    [icon('data:image/svg+xml;base64,PHN2Zy8+','image/svg+xml')],[icon(PNG+'AAAA','image/jpeg')],
    [icon(PNG+'AA AA')],[icon(PNG+'AAAA','image/png',['big'])],[icon(PNG+'AAAA','image/png',[])],
    [icon(PNG+'A'.repeat(MAX_ICON_BYTES))],Array.from({length:5},()=>icon(PNG+'AAAA'))];
  for(const icons of invalid)assert.throws(()=>createMcpHandler(engine(),{serverMetadata:{icons}}),{name:'TypeError',message:'INVALID_SERVER_ICONS'},JSON.stringify(icons).slice(0,80));
  for(const serverMetadata of [null,[],'x',{version:'9'},{name:'spoof'},{title:''},{title:7},{websiteUrl:'x'.repeat(513)}])
    assert.throws(()=>createMcpHandler(engine(),{serverMetadata}),{name:'TypeError',message:'INVALID_SERVER_METADATA'},JSON.stringify(serverMetadata));
});

test('brand: without the raster files the server still starts, only without an icon',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-brandless-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'src'));fs.copyFileSync(file('src/brand.mjs'),path.join(root,'src/brand.mjs'));
  const isolated=await import(new URL('file://'+path.join(root,'src/brand.mjs')).href);
  assert.deepEqual(isolated.MCP_ICONS,[]);assert.deepEqual(isolated.serverBrand('alpha'),{title:'BBrainX · alpha'});
  const hello=await createMcpHandler(engine(),{serverMetadata:isolated.serverBrand('alpha')}).handle({jsonrpc:'2.0',id:1,method:'initialize',params:{}});
  assert.deepEqual(hello.result.serverInfo,{title:'BBrainX · alpha',name:'probe',version:'1.0.0'});
});

async function announcedServer(args,env){
  const client=new Client({name:'icon-probe',version:'1'});
  const transport=new StdioClientTransport({command:process.execPath,args,env:{...process.env,...env},stderr:'pipe'});
  transport.stderr?.on('data',()=>{});
  await client.connect(transport);
  try{return client.getServerVersion();}finally{await client.close();}
}

test('brand: both real MCP entry points announce the icon to the official client',async t=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-icons-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const repo=path.join(home,'repo');fs.mkdirSync(repo);fs.writeFileSync(path.join(repo,'a.js'),'export const a=1;\n');
  const store=new BrainStore(path.join(home,'state'));store.register('icons',repo);store.close();
  const main=await announcedServer([file('bin/bbrainx.mjs'),'mcp','--project','icons'],{BBRAINX_HOME:path.join(home,'state')});
  assert.equal(main.name,'bbrainx');assert.equal(main.title,'BBrainX · icons');assert.deepEqual(main.icons,structuredClone(MCP_ICONS));
  const lanes=laneFixture(t);
  const lane=await announcedServer([file('scripts/lanes.mjs'),'mcp','--project','product','--lane','alpha'],{BBRAINX_HOME:lanes.home});
  assert.equal(lane.title,'BBrainX · product');assert.deepEqual(lane.icons,structuredClone(MCP_ICONS));
});

test('brand: every panel page declares a favicon that resolves',()=>{
  for(const asset of ['favicon.svg','icon.svg','icon-32.png','icon-128.png'])assert.ok(fs.statSync(file('public/brand/'+asset)).isFile(),asset);
  for(const page of ['index.html','public/observatory/index.html']){
    const html=fs.readFileSync(file(page),'utf8');
    assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="/brand/favicon.svg"'),page+' → SVG favicon');
    assert.ok(html.includes('<link rel="icon" type="image/png" sizes="32x32" href="/brand/icon-32.png"'),page+' → PNG fallback');
  }
  // O Atlas também é publicado sem public/ (vite.atlas.config.mjs + allowlist de scripts/atlas-publish.mjs): ícone inline.
  assert.ok(fs.readFileSync(file('atlas.html'),'utf8').includes('<link rel="icon" type="image/png" sizes="32x32" href="'+MCP_ICONS[0].src+'"'),'atlas.html inline icon');
});
