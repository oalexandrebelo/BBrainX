// Servidor de teste. Corpus e recibos identificados como sintéticos; não substitui uma API de modelo.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {BrainStore} from '../../src/store.mjs';import {indexProject} from '../../src/retrieval.mjs';
import {compileContext} from '../../src/context.mjs';import {startServer} from '../../src/server.mjs';
import {UsageStore} from '../../src/usage/store.mjs';import {usageOverview} from '../../src/usage/summary.mjs';
import {call,prices,pair} from './usage-fixtures.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bb-observatory-browser-')),brain=new BrainStore(path.join(root,'state'));
for(const project of ['demo','synthetic-receipts']){
 const code=path.join(root,project);fs.mkdirSync(code);
 for(let i=0;i<12;i++)fs.writeFileSync(path.join(code,'session'+i+'.ts'),Array.from({length:35},(_,j)=>`export function validateSession${i}_${j}(value: string) { return value === "session-${i}-${j}"; }`).join('\n'));
 brain.register(project,code);indexProject(brain,project);
}
process.env.BBRAINX_MEASURE_CONTEXT='1';
for(const budget of [512,768,1024])compileContext(brain,{project:'demo',query:'validateSession',budget});
const store=new UsageStore(brain.home);
store.import('synthetic-receipts',[
 {expectedVersion:0,call:call({pricing:prices(),reportedCost:{currency:'USD',amount:'0.012',reference:'synthetic-not-provider-bill'}})},
 {expectedVersion:0,call:call({callId:'candidate',run:'fixture-candidate',pricing:prices(),reportedCost:{currency:'USD',amount:'0.010',reference:'synthetic-not-provider-bill'},usage:{input_tokens:600,input_tokens_details:{cached_tokens:300,cache_write_tokens:0},output_tokens:100,total_tokens:700}})}
]);store.recordPair('synthetic-receipts',pair());store.close();
fs.mkdirSync('artifacts/observatory',{recursive:true});
fs.writeFileSync('artifacts/observatory/context-report.json',JSON.stringify(usageOverview(brain,'demo'),null,2));
fs.writeFileSync('artifacts/observatory/synthetic-receipts-report.json',JSON.stringify(usageOverview(brain,'synthetic-receipts'),null,2));
const server=await startServer(brain,{port:4329});console.log(server.url);
let exiting=false;async function stop(){if(exiting)return;exiting=true;await server.close();brain.close();fs.rmSync(root,{recursive:true,force:true});}
for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>stop().then(()=>process.exit(0)));
