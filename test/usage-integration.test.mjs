import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {BrainStore} from '../src/store.mjs';import {indexProject} from '../src/retrieval.mjs';
import {compileContext,tokenCount} from '../src/context.mjs';import {startServer} from '../src/server.mjs';
import {UsageStore,USAGE_DB} from '../src/usage/store.mjs';import {usageOverview} from '../src/usage/summary.mjs';
import {readUsageFile} from '../scripts/usage.mjs';import {call} from './fixtures/usage-fixtures.mjs';
function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bb-usage-integration-')),code=path.join(root,'code');fs.mkdirSync(code);
 for(let i=0;i<12;i++)fs.writeFileSync(path.join(code,'session'+i+'.ts'),Array.from({length:35},(_,j)=>`export function validateSession${i}_${j}(value: string) { return value === "session-${i}-${j}"; }`).join('\n'));
 const brain=new BrainStore(path.join(root,'state'));brain.register('demo',code);indexProject(brain,'demo');
 t.after(()=>{brain.close();fs.rmSync(root,{recursive:true,force:true});});return {root,brain};
}
function measure(value,fn){const before=process.env.BBRAINX_MEASURE_CONTEXT;if(value===null)delete process.env.BBRAINX_MEASURE_CONTEXT;else process.env.BBRAINX_MEASURE_CONTEXT=value;try{return fn();}finally{if(before===undefined)delete process.env.BBRAINX_MEASURE_CONTEXT;else process.env.BBRAINX_MEASURE_CONTEXT=before;}}
test('Instrumentação opt-in não altera bytes do contexto, seleção ou contagem final',t=>{
 const {brain}=setup(t),args={project:'demo',query:'validateSession',budget:1000};
 const a=measure(null,()=>compileContext(brain,args)),b=measure('1',()=>compileContext(brain,args));
 assert.equal(a.text,b.text);assert.equal(a.packId,b.packId);assert.deepEqual(a.sources,b.sources);assert.equal(b.payloadTokens,tokenCount(b.text));
 const report=usageOverview(brain,'demo');assert.equal(report.context.packs,2);assert.equal(report.context.knownPairs,1);assert.equal(report.context.unknownPairs,1);assert(report.context.reducedTokens>0);
 assert.equal(report.usage.tokens.totalTokens.value,null);
});
test('Evento de medição não grava query, corpos dos arquivos ou custo financeiro',t=>{
 const {brain}=setup(t);measure('1',()=>compileContext(brain,{project:'demo',query:'validateSession',budget:1000}));
 const event=brain.events('demo').find(e=>e.type==='context.compiled');assert(event);assert.equal(event.payload.measurementVersion,'candidate-window-v1');
 assert.equal(JSON.stringify(event).includes('export function'),false);assert.equal(Object.hasOwn(event.payload,'query'),false);assert.equal(Object.hasOwn(event.payload,'text'),false);
});
test('Referência acima de 64 KiB permanece desconhecida sem afetar o pacote',t=>{
 const {brain}=setup(t),root=brain.project('demo').root;
 for(let i=0;i<12;i++)fs.writeFileSync(path.join(root,'session'+i+'.ts'),Array.from({length:50},(_,j)=>`export function validateSession${i}_${j}(){ return "${'metadata_session_'.repeat(18)}${j}"; }`).join('\n'));
 indexProject(brain,'demo');const result=measure('1',()=>compileContext(brain,{project:'demo',query:'validateSession',budget:1000}));assert(result.payloadTokens<=1000);
 assert.equal(usageOverview(brain,'demo').context.reducedTokens,null);
});
test('HTTP de uso aplica origem/host e não cria banco de recibos ao ler',async t=>{
 const {brain}=setup(t),server=await startServer(brain,{port:0});t.after(()=>server.close());
 const ok=await fetch(server.url+'/api/usage?project=demo');assert.equal(ok.status,200);assert.equal((await ok.json()).usage.importedCalls,0);
 assert.equal(fs.existsSync(path.join(brain.home,USAGE_DB)),false);
 const bad=await fetch(server.url+'/api/usage?project=demo',{headers:{Origin:'https://outsider.example'}});assert.equal(bad.status,403);
 const host=await fetch(server.url+'/api/usage?project=demo',{headers:{Host:'attacker.example'}});assert.equal(host.status,403);
 const missing=await fetch(server.url+'/api/usage?project=other');assert.equal(missing.status,400);
 const post=await fetch(server.url+'/api/usage?project=demo',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(post.status,405);
});
test('Importação permanece particionada e usa a correção corrente no HTTP',async t=>{
 const {brain}=setup(t);brain.register('second',path.dirname(brain.project('demo').root));
 const s=new UsageStore(brain.home);s.import('demo',[{expectedVersion:0,call:call()}]);s.close();
 const server=await startServer(brain,{port:0});t.after(()=>server.close());
 const report=await(await fetch(server.url+'/api/usage?project=demo')).json();assert.equal(report.usage.tokens.totalTokens.value,1200);
 const empty=await(await fetch(server.url+'/api/usage?project=second')).json();assert.equal(empty.usage.tokens.totalTokens.value,null);
});
test('Importador limita arquivo e rejeita UTF-8 inválido, diretório e campos extra no recibo',t=>{
 const {root}=setup(t),file=path.join(root,'import.json');
 fs.writeFileSync(file,Buffer.from([0xff,0xff]));assert.throws(()=>readUsageFile(file));
 fs.writeFileSync(file,Buffer.alloc(1024*1024+1,32));assert.throws(()=>readUsageFile(file),{code:'IMPORT_TOO_LARGE'});
 assert.throws(()=>readUsageFile(root),{code:'UNSAFE_IMPORT_FILE'});
 fs.writeFileSync(file,'[]');assert.deepEqual(readUsageFile(file),[]);
});
