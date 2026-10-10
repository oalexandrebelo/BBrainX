import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BrainStore} from '../../src/store.mjs';
import {indexProject} from '../../src/retrieval.mjs';
import {startServer} from '../../src/server.mjs';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-control-e2e-'));
const brain=new BrainStore(path.join(temp,'state'));
for(const project of ['demo','demo-second']){
 const root=path.join(temp,project==='demo'?'demo-project':project);fs.mkdirSync(root);
 fs.writeFileSync(path.join(root,'README.md'),`# ${project}\nFixture local de texto para testes do painel.\n`);
 brain.register(project,root);indexProject(brain,project);
}
const server=await startServer(brain,{port:4331});console.log(server.url);
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await server.close();brain.close();fs.rmSync(temp,{recursive:true,force:true});}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>stop().then(()=>process.exit(0)));
