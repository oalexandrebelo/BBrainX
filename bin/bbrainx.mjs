#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ensure, newId } from '../src/primitives.mjs';
import { doctor, stateHome } from '../src/host.mjs';
import { clientConfig, CLIENTS } from '../src/clients.mjs';

const {values,args}=(()=>{const parsed=parseArgs({allowPositionals:true,options:{project:{type:'string'},root:{type:'string'},query:{type:'string'},budget:{type:'string'},task:{type:'string'},file:{type:'string'},version:{type:'string'},key:{type:'string'},port:{type:'string'},id:{type:'string'},status:{type:'string'},statement:{type:'string'},source:{type:'string'},client:{type:'string'},mode:{type:'string'},state:{type:'string'},strict:{type:'boolean'},help:{type:'boolean'}}});return {values:parsed.values,args:parsed.positionals};})();
const command=args[0]||'help';let store;
const print=value=>console.log(JSON.stringify(value,null,2));
try{
  if(command==='doctor'){const {scenario}=await import('../src/scenario.mjs');const report={...doctor(),scenario:scenario()};print(report);process.exitCode=report.ready?0:1;}
  else if(command==='help'||values.help){console.log(`BBrainX — GODMODCODE 0.4

Começar (registra a pasta, indexa e mostra como ligar ao seu harness):
  node bin/bbrainx.mjs up --root /caminho/do/projeto [--project nome]
  node bin/bbrainx.mjs doctor
  node bin/bbrainx.mjs config --project nome --client ${CLIENTS.join('|')}

Contexto e busca:
  node bin/bbrainx.mjs index --project nome
  node bin/bbrainx.mjs search --project nome --query "onde a sessão é validada"
  node bin/bbrainx.mjs context --project nome --query "validação de sessão" --budget 4000 [--task T1] [--strict]

Continuidade e memória:
  node bin/bbrainx.mjs checkpoint --project nome --task T1 --file checkpoint.json --version 0 --key tentativa-1
  node bin/bbrainx.mjs memory --project nome
  node bin/bbrainx.mjs propose --project nome --statement TEXTO --source ORIGEM [--mode always|relevant]
  node bin/bbrainx.mjs approve --project nome --id ID --version 1 [--mode always|relevant]
  node bin/bbrainx.mjs revoke --project nome --id ID --version 2

Servir:
  node bin/bbrainx.mjs mcp --project nome        (servidor MCP por stdio; BBRAINX_TRACE=1 registra as chamadas na saída de erro)
  node bin/bbrainx.mjs serve [--port 4317]       (painel local)
  node bin/bbrainx.mjs demo
  node bin/bbrainx.mjs backup --file /destino/backup.sqlite

Perfil opcional Laya (modelo local de decisão; não altera o pacote de contexto):
  node bin/bbrainx.mjs laya status | install | remove
  node bin/bbrainx.mjs laya ask --state "texto" --file perguntas.json

Nenhum comando altera a configuração dos harnesses. Mais: docs/QUICKSTART.md`);}
  else if(command==='config'){
    ensure(values.project,'PROJECT_REQUIRED');
    console.log(clientConfig(values.client||'claude',{node:process.execPath,entry:fileURLToPath(import.meta.url),project:values.project,home:stateHome()}));
  }
  else if(command==='laya'){
    const laya=await import('../src/laya.mjs'), action=args[1]||'status', log=line=>console.error('laya: '+line);
    if(action==='status')print(laya.layaStatus());
    else if(action==='install'){
      const runtime=laya.installRuntime({log}), weights=await laya.fetchWeights({log});
      // Fumaça com uma decisão fixa: prova que o ambiente carrega os pesos conferidos antes de declarar instalado.
      const broker=new laya.LayaBroker({deadlineMs:120000});let smoke;
      try{smoke=await broker.decide(['The build failed because a test timed out.'],{kind:{type:'choice',instructions:'What is this message about?',criteria:{build:'compilation, tests, CI',billing:'invoices and payments'}}});}
      finally{var info=broker.info;broker.stop();}
      ensure(smoke.ok,'LAYA_SMOKE_FAILED','O ambiente foi instalado, mas o modelo não respondeu ('+smoke.reason+').');
      const paths=laya.layaPaths();fs.writeFileSync(paths.receipt,JSON.stringify({installedAt:new Date().toISOString(),tool:runtime.tool,...info,smokeMs:smoke.ms,platform:process.platform+' '+process.arch,weights},null,2)+'\n');
      print(laya.layaStatus());
    }
    else if(action==='ask'){
      ensure(values.state&&values.file,'STATE_AND_FILE_REQUIRED','Use --state "texto" --file perguntas.json');
      ensure(laya.layaStatus().installed,'LAYA_NOT_INSTALLED','Execute antes: node bin/bbrainx.mjs laya install');
      const broker=new laya.LayaBroker({deadlineMs:120000});
      try{const reply=await broker.decide([values.state],JSON.parse(fs.readFileSync(values.file,'utf8')));print(reply.ok?{...reply.results[0],ms:reply.ms,runtime:broker.info}:reply);if(!reply.ok)process.exitCode=1;}
      finally{broker.stop();}
    }
    else if(action==='remove')print(laya.removeProfile());
    else throw new Error('Use: laya status | install | ask | remove');
  }
  else {
    const {BrainStore}=await import('../src/store.mjs');store=new BrainStore();
    if(command==='init'){ensure(values.root&&values.project,'ROOT_AND_PROJECT_REQUIRED');print(store.register(values.project,values.root));}
    else if(command==='up'){
      // Um passo só: registra (ou reencontra) a pasta, indexa e mostra como ligar cada harness.
      const root=fs.realpathSync(path.resolve(values.root||process.cwd())), known=store.projects().find(item=>item.root===root);
      const project=known?.id||values.project||path.basename(root).replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^[^A-Za-z0-9]+/,'').slice(0,80).replace(/[^A-Za-z0-9]+$/,'')||'projeto';
      store.register(project,root);
      const {indexProject}=await import('../src/retrieval.mjs'), indexed=indexProject(store,project), entry=fileURLToPath(import.meta.url);
      print({project,root,files:indexed.files,changed:indexed.changed,skippedByReason:indexed.skippedByReason,snapshot:indexed.snapshot,
        next:{search:'node '+entry+' search --project '+project+' --query "..."',connect:Object.fromEntries(CLIENTS.map(client=>[client,'node '+entry+' config --project '+project+' --client '+client])),panel:'node '+entry+' serve'}});
    }
    else if(command==='demo'){
      const root=path.join(store.home,'demo-project');fs.mkdirSync(root,{recursive:true});
      const fixture={ 'README.md':'# Nebula demo\nAutenticação exige sessão válida. Dados permanecem locais.\n', 'session.ts':'export function hasSession(token: string | null): boolean {\n  return Boolean(token && token.length > 0);\n}\n', 'ARCHITECTURE.md':'# Decisão aprovada para demonstração\nUsar checkpoints versionados. Nenhum agente aprova a própria hipótese.\n'};
      for(const [name,content]of Object.entries(fixture))if(!fs.existsSync(path.join(root,name)))fs.writeFileSync(path.join(root,name),content);
      store.register('demo',root);const {indexProject}=await import('../src/retrieval.mjs');print(indexProject(store,'demo'));
    }
    else if(command==='index'){const {indexProject}=await import('../src/retrieval.mjs');print(indexProject(store,values.project));}
    else if(command==='search'){const {search}=await import('../src/retrieval.mjs');print(search(store,values.project,values.query));}
    else if(command==='context'){const {compileContext}=await import('../src/context.mjs');print(compileContext(store,{project:values.project,query:values.query,budget:Number(values.budget||4000),...(values.task?{task:values.task}:{}),onStale:values.strict?'fail':'refresh'}));}
    else if(command==='checkpoint'){ensure(values.file,'FILE_REQUIRED');const {saveCheckpoint}=await import('../src/session.mjs');print(saveCheckpoint(store,{project:values.project,task:values.task,content:JSON.parse(fs.readFileSync(values.file,'utf8')),expectedVersion:Number(values.version||0),idempotencyKey:values.key||newId()}));}
    else if(command==='memory')print(store.memories(values.project));
    else if(command==='propose')print(store.proposeMemory(values.project,values.statement,values.source,values.mode));
    else if(command==='approve'||command==='revoke')print(store.reviewMemory(values.project,values.id,command==='approve'?'approved':'revoked',Number(values.version),values.mode));
    else if(command==='backup'){ensure(values.file,'FILE_REQUIRED');print(store.backup(values.file));}
    else if(command==='mcp'){
      ensure(values.project,'PROJECT_REQUIRED');store.project(values.project);
      const {makeEngine,INSTRUCTIONS}=await import('../src/engine.mjs'),{serveMcpStdio}=await import('../src/mcp.mjs');
      // A saída padrão é do protocolo; o rastro opcional vai para a saída de erro, sem argumentos nem resultados.
      const onEvent=process.env.BBRAINX_TRACE==='1'?event=>console.error(JSON.stringify(event)):undefined;
      await serveMcpStdio(makeEngine(store,[values.project],{onEvent}),{principal:{id:'local-mcp-host'},maxLineBytes:1048576,instructions:INSTRUCTIONS+' Pass project "'+values.project+'" in every call.',isFailure:output=>output?.ok===false});
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
