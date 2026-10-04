#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ensure, newId } from '../src/primitives.mjs';
import { doctor, stateHome } from '../src/host.mjs';

const {values,args}=(()=>{const parsed=parseArgs({allowPositionals:true,options:{project:{type:'string'},root:{type:'string'},query:{type:'string'},budget:{type:'string'},task:{type:'string'},file:{type:'string'},version:{type:'string'},key:{type:'string'},port:{type:'string'},id:{type:'string'},status:{type:'string'},statement:{type:'string'},source:{type:'string'},client:{type:'string'},help:{type:'boolean'}}});return {values:parsed.values,args:parsed.positionals};})();
const command=args[0]||'help';let store;
const print=value=>console.log(JSON.stringify(value,null,2));
try{
  if(command==='doctor'){const report=doctor();print(report);process.exitCode=report.ready?0:1;}
  else if(command==='help'||values.help){console.log(`BBrainX — GODMODCODE 0.2\n\nnode bin/bbrainx.mjs doctor\nnode bin/bbrainx.mjs init --project meu-projeto --root /caminho/absoluto\nnode bin/bbrainx.mjs index --project meu-projeto\nnode bin/bbrainx.mjs search --project meu-projeto --query autenticação\nnode bin/bbrainx.mjs context --project meu-projeto --query autenticação --budget 4000\nnode bin/bbrainx.mjs checkpoint --project meu-projeto --task T1 --file checkpoint.json --version 0 --key tentativa-1\nnode bin/bbrainx.mjs memory --project meu-projeto\nnode bin/bbrainx.mjs approve --project meu-projeto --id ID --version 1\nnode bin/bbrainx.mjs revoke --project meu-projeto --id ID --version 2\nnode bin/bbrainx.mjs config --project meu-projeto --client claude\nnode bin/bbrainx.mjs mcp --project meu-projeto\nnode bin/bbrainx.mjs serve\nnode bin/bbrainx.mjs demo\nnode bin/bbrainx.mjs backup --file /destino/backup.sqlite\n\nSem alterações automáticas nas configurações dos harnesses. Mais: docs/QUICKSTART.md`);}
  else if(command==='config'){
    ensure(values.project,'PROJECT_REQUIRED');
    const entry=fileURLToPath(import.meta.url),cliArgs=[entry,'mcp','--project',values.project];
    const config={command:process.execPath,args:cliArgs,env:{BBRAINX_HOME:stateHome()}};
    if(values.client==='codex')console.log('[mcp_servers.bbrainx]\ncommand = '+JSON.stringify(process.execPath)+'\nargs = '+JSON.stringify(cliArgs)+'\n[mcp_servers.bbrainx.env]\nBBRAINX_HOME = '+JSON.stringify(stateHome()));
    else print({mcpServers:{bbrainx:config}});
  }
  else {
    const {BrainStore}=await import('../src/store.mjs');store=new BrainStore();
    if(command==='init'){ensure(values.root&&values.project,'ROOT_AND_PROJECT_REQUIRED');print(store.register(values.project,values.root));}
    else if(command==='demo'){
      const root=path.join(store.home,'demo-project');fs.mkdirSync(root,{recursive:true});
      const fixture={ 'README.md':'# Nebula demo\nAutenticação exige sessão válida. Dados permanecem locais.\n', 'session.ts':'export function hasSession(token: string | null): boolean {\n  return Boolean(token && token.length > 0);\n}\n', 'ARCHITECTURE.md':'# Decisão aprovada para demonstração\nUsar checkpoints versionados. Nenhum agente aprova a própria hipótese.\n'};
      for(const [name,content]of Object.entries(fixture))if(!fs.existsSync(path.join(root,name)))fs.writeFileSync(path.join(root,name),content);
      store.register('demo',root);const {indexProject}=await import('../src/retrieval.mjs');print(indexProject(store,'demo'));
    }
    else if(command==='index'){const {indexProject}=await import('../src/retrieval.mjs');print(indexProject(store,values.project));}
    else if(command==='search'){const {search}=await import('../src/retrieval.mjs');print(search(store,values.project,values.query));}
    else if(command==='context'){const {compileContext}=await import('../src/context.mjs');print(compileContext(store,{project:values.project,query:values.query,budget:Number(values.budget||4000),...(values.task?{task:values.task}:{})}));}
    else if(command==='checkpoint'){ensure(values.file,'FILE_REQUIRED');print(store.checkpoint(values.project,values.task,JSON.parse(fs.readFileSync(values.file,'utf8')),Number(values.version||0),values.key||newId()));}
    else if(command==='memory')print(store.memories(values.project));
    else if(command==='propose')print(store.proposeMemory(values.project,values.statement,values.source));
    else if(command==='approve'||command==='revoke')print(store.reviewMemory(values.project,values.id,command==='approve'?'approved':'revoked',Number(values.version)));
    else if(command==='backup'){ensure(values.file,'FILE_REQUIRED');print(store.backup(values.file));}
    else if(command==='mcp'){
      ensure(values.project,'PROJECT_REQUIRED');store.project(values.project);
      const {makeEngine}=await import('../src/engine.mjs'),{serveMcpStdio}=await import('@invokta/mcp');
      await serveMcpStdio(makeEngine(store,[values.project]),{principal:{id:'local-mcp-host'},maxReadBufferBytes:1048576});
    }
    else if(command==='serve'){
      const {startServer}=await import('../src/server.mjs'),server=await startServer(store,{port:Number(values.port||4317)});
      console.error('BBrainX local: '+server.url+' | Ctrl+C para encerrar');
      await new Promise(resolve=>{let closing=false;const end=async()=>{if(closing)return;closing=true;await server.close();resolve();};process.once('SIGINT',end);process.once('SIGTERM',end);});
    }
    else throw new Error('Comando desconhecido. Use help.');
  }
}catch(e){console.error(JSON.stringify({error:e.code||'FAILED',message:e.message}));process.exitCode=1;}
finally{store?.close();}
