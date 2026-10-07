import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';import assert from 'node:assert/strict';
import {BrainStore} from '../src/store.mjs';import {indexProject} from '../src/retrieval.mjs';import {compileContext} from '../src/context.mjs';
const BASE='a9636e9402e3fa673ae05b3489202da1048aef5e';
const temporary=path.resolve('src/.observatory-baseline.mjs');
if(fs.existsSync(temporary))throw new Error('BASELINE_PROBE_ALREADY_EXISTS');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-parity-')),code=path.join(root,'code');fs.mkdirSync(code);
let brain;
try{
 fs.writeFileSync(temporary,execFileSync('git',['show',BASE+':src/context.mjs'],{maxBuffer:1000000}),{flag:'wx'});
 const original=await import(pathToFileURL(temporary).href);
 // Corpus rotulado sintético. Conteúdo do usuário nunca entra neste experimento.
 for(let i=0;i<12;i++){
  fs.writeFileSync(path.join(code,'session'+i+'.ts'),Array.from({length:90},(_,j)=>`export function validateSession${i}_${j}(value: string) { return value === "session_${i}_${j}"; }`).join('\n'));
  fs.writeFileSync(path.join(code,'session'+i+'.md'),Array.from({length:90},(_,j)=>`Session validation ${i} line ${j}. Check invalid token before opening the private document.`).join('\n'));
 }
 brain=new BrainStore(path.join(root,'state'));brain.register('parity',code);indexProject(brain,'parity');
 const args=[];for(const budget of [512,768,1024,2000,4000,8000])for(const query of ['session validation','validateSession','sessão inválida'])args.push({project:'parity',query,budget});
 const oldMeasure=process.env.BBRAINX_MEASURE_CONTEXT;delete process.env.BBRAINX_MEASURE_CONTEXT;
 const before=[],after=[];
 try{
  for(const options of args){const a=original.compileContext(brain,options),b=compileContext(brain,options);assert.deepEqual(b,a,'CONTEXT_PARITY_FAILED');}
  // Alterna ordem para reduzir um viés simples de aquecimento. Não é ensaio estatístico de performance.
  for(let iteration=0;iteration<3;iteration++)for(const options of args){
   for(const name of iteration%2?['after','before']:['before','after']){
    const start=performance.now();(name==='before'?original.compileContext:compileContext)(brain,options);(name==='before'?before:after).push(performance.now()-start);
   }
  }
 }finally{if(oldMeasure===undefined)delete process.env.BBRAINX_MEASURE_CONTEXT;else process.env.BBRAINX_MEASURE_CONTEXT=oldMeasure;}
 const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {samples:sorted.length,p50Ms:sorted[Math.ceil(sorted.length*.5)-1],p95Ms:sorted[Math.ceil(sorted.length*.95)-1]};};
 const report={schemaVersion:1,kind:'synthetic-context-parity-and-exploratory-timing',baseRevision:BASE,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),parityCases:args.length,passed:args.length,before:stats(before),after:stats(after),measuringReference:false,providerCalls:0,taskSuccess:null,mediumHardwareValidated:false,limitations:['Corpus gerado; mesmo banco/cache de páginas; sem inferência; não estabelece ganho universal.','Paridade compara todo payload ao código original, inclusive sources, packId e contagem exata.','Amostra pequena e ordem determinística; timing exploratório, não estimativa estatística de população.']};
 fs.mkdirSync('artifacts/observatory',{recursive:true});fs.writeFileSync('artifacts/observatory/parity.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{brain?.close();fs.rmSync(temporary,{force:true});fs.rmSync(root,{recursive:true,force:true});}
