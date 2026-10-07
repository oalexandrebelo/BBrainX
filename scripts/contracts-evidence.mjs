import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { BrainStore } from '../src/store.mjs';
import { indexProject, search } from '../src/retrieval.mjs';
import { compileContext } from '../src/context.mjs';

const BASE='a9636e9402e3fa673ae05b3489202da1048aef5e', out='artifacts/core-contracts';
fs.mkdirSync(out,{recursive:true});
const run=spawnSync(process.execPath,['--test','--test-reporter=tap','test/contracts-regression.test.mjs'],{encoding:'utf8',timeout:120000,maxBuffer:8000000});
const log=(run.stdout||'')+(run.stderr||'');fs.writeFileSync(path.join(out,'tests.log'),log);
const metric=k=>Number(log.match(new RegExp('^# '+k+' (\\d+)','m'))?.[1]??NaN);
const tests=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(k=>[k,metric(k)]));
assert(!run.error&&run.status===0&&tests.tests>0&&tests.tests===tests.pass&&tests.fail===0&&tests.cancelled===0&&tests.skipped===0&&tests.todo===0,'INCOMPLETE_CONTRACT_TESTS');
const baselinePath=path.resolve('src/.ci-contract-original.mjs');
assert(!fs.existsSync(baselinePath),'BASELINE_PATH_EXISTS');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bb-contract-io-'));let brain;
let io;
try{
  fs.writeFileSync(baselinePath,execFileSync('git',['show',BASE+':src/context.mjs'],{maxBuffer:1000000}),{flag:'wx'});
  const original=await import(pathToFileURL(baselinePath).href);
  const code=path.join(root,'project');fs.mkdirSync(code);
  fs.writeFileSync(path.join(code,'session.ts'),Array.from({length:600},(_,i)=>`export function validateSession${i}(value: string) { return value === "token-${i}"; }`).join('\n'));
  brain=new BrainStore(path.join(root,'state'));brain.register('io',code);indexProject(brain,'io');
  const options={project:'io',query:'validateSession',budget:4000};
  const candidates=search(brain,'io',options.query,30).items;
  assert(candidates.length>1,'NO_MULTI_CHUNK_SCENARIO');assert.equal(new Set(candidates.map(c=>c.path)).size,1);
  const actual=path.join(brain.project('io').root,'session.ts'),realRead=fs.readFileSync;
  const measure=fn=>{
    let calls=0,bytes=0;
    fs.readFileSync=function(file,...args){const value=realRead.call(fs,file,...args);if(file===actual){calls++;bytes+=Buffer.isBuffer(value)?value.length:Buffer.byteLength(value);}return value;};
    try{return {payload:fn(brain,options),get calls(){return calls;},get bytes(){return bytes;}};}
    finally{fs.readFileSync=realRead;}
  };
  const before=measure(original.compileContext),after=measure(compileContext);
  assert.deepEqual(after.payload,before.payload,'CONTEXT_IO_PARITY_FAILED');
  assert.equal(before.calls,candidates.length);assert.equal(after.calls,1);
  assert.equal(before.bytes,after.bytes*candidates.length);
  io={kind:'synthetic-repeated-chunk-real-filesystem',candidateChunks:candidates.length,files:1,
    before:{wholeFileReads:before.calls,bytesRead:before.bytes},after:{wholeFileReads:after.calls,bytesRead:after.bytes},
    identicalPayload:true,providerCalls:0,limitations:['Contagem instrumentada das leituras reais; não é benchmark de disco frio nem latência de tarefa.','Cache de page do SO não foi limpo; redução de syscalls não equivale a redução proporcional do tempo.']};
}finally{brain?.close();fs.rmSync(baselinePath,{force:true});fs.rmSync(root,{recursive:true,force:true});}
const report={schemaVersion:1,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),base:BASE,
  runId:process.env.GITHUB_RUN_ID??null,observedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,architecture:process.arch},
  tests,io,dependenciesAdded:0,modelInference:false,mediumNativeBenchmark:false,
  limitations:['Timeout é cooperativo; execução síncrona já iniciada pode produzir efeito.','Dados do usuário e modelos não são acessados pelo teste.','Não integra automaticamente outros PRs, daemon, LSP ou memória temporal.']};
fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
