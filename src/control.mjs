import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensure, hash, identifier } from './primitives.mjs';
import { safeDirectory } from './host.mjs';
import { usageOverview } from './usage/summary.mjs';
import { readWorkspaceOverview } from './workspace.mjs';
import { discoverIntegrations } from './integrations.mjs';
import { budgetOverview } from './budget.mjs';
import { verifyRoot } from './source-root.mjs';

const MAX_RECORD=65536, MAX_SESSIONS=256, MAX_RUNS=128, LEASE_MS=90000;
function directory(home,...parts){
  let current=safeDirectory(home);
  for(const part of ['control-v1',...parts]){
    current=path.join(current,part);
    if(fs.existsSync(current))ensure(fs.lstatSync(current).isDirectory()&&!fs.lstatSync(current).isSymbolicLink(),'UNSAFE_CONTROL_PATH');
    else fs.mkdirSync(current,{mode:0o700});
  }
  return current;
}
function readDirectory(home,...parts){
  let current=path.resolve(home);
  for(const part of ['control-v1',...parts]){
    current=path.join(current,part);
    if(!fs.existsSync(current))return null;
    const stat=fs.lstatSync(current);ensure(stat.isDirectory()&&!stat.isSymbolicLink(),'UNSAFE_CONTROL_PATH');
  }
  return current;
}
function read(file){
  const stat=fs.lstatSync(file);ensure(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=MAX_RECORD,'INVALID_CONTROL_RECORD');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try{
    const buffer=Buffer.alloc(MAX_RECORD+1), bytes=fs.readSync(fd,buffer,0,buffer.length,0);
    ensure(bytes<=MAX_RECORD,'INVALID_CONTROL_RECORD');
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,bytes)));
    ensure(value.schemaVersion===1,'CONTROL_VERSION_UNSUPPORTED');return value;
  }finally{fs.closeSync(fd);}
}
function write(dir,id,value){
  identifier(id);const target=path.join(dir,id+'.json');
  if(fs.existsSync(target))ensure(fs.lstatSync(target).isFile()&&!fs.lstatSync(target).isSymbolicLink(),'UNSAFE_CONTROL_PATH');
  const data=JSON.stringify({schemaVersion:1,...value});ensure(Buffer.byteLength(data)<=MAX_RECORD,'CONTROL_RECORD_TOO_LARGE');
  const temporary=path.join(dir,'.'+id+'.'+randomUUID()+'.tmp');let fd;
  try{fd=fs.openSync(temporary,'wx',0o600);fs.writeFileSync(fd,data);fs.closeSync(fd);fd=undefined;fs.renameSync(temporary,target);}
  finally{if(fd!==undefined)fs.closeSync(fd);fs.rmSync(temporary,{force:true});}
}
function records(home,parts,limit){
  const dir=readDirectory(home,...parts);if(!dir)return {items:[],truncated:false,invalid:0};
  const items=[];let seen=0,invalid=0;
  // Bound directory enumeration as well as JSON materialization.
  const stream=fs.opendirSync(dir);
  try{for(let entry; (entry=stream.readSync());){
    if(++seen>limit*2)break;
    if(!entry.name.endsWith('.json')||!entry.isFile())continue;
    if(items.length===limit)break;
    try{items.push(read(path.join(dir,entry.name)));}catch{invalid++;}
  }}finally{stream.closeSync();}
  return {items,truncated:seen>limit*2||items.length===limit,invalid};
}
const projectKey=project=>hash(project).slice(0,32);
const stamp=()=>new Date().toISOString();
function observationError(error,fallback){
  try{const code=error?.code;return typeof code==='string'&&/^[A-Z0-9_]{1,80}$/.test(code)?code:fallback;}
  catch{return fallback;}
}

/** Metadata only. Host supplies identity; tool arguments never reach this recorder. */
export function observeEngine(engine,brain,options={}){
  try{return recorder(engine,brain,options);}catch(e){return {engine,recordingError:observationError(e,'CONTROL_UNAVAILABLE'),connected(){},close(){}};}
}
function recorder(engine,brain,{project,harness='unknown',workspace,lane=null,clock=Date.now}={}){
  brain.project(project);identifier(harness);if(lane!==null)identifier(lane);
  const dir=directory(brain.home,projectKey(project),'sessions'), id=randomUUID();
  const snapshot=records(brain.home,[projectKey(project),'sessions'],MAX_SESSIONS);
  if(snapshot.items.length>=MAX_SESSIONS){
    const old=snapshot.items.filter(x=>x.status==='closed'||clock()-Date.parse(x.lastSeen)>LEASE_MS).sort((a,b)=>Date.parse(a.lastSeen)-Date.parse(b.lastSeen))[0];
    ensure(old&&typeof old.id==='string','CONTROL_SESSION_QUOTA');identifier(old.id);fs.unlinkSync(path.join(dir,old.id+'.json'));
  }
  const state={id,project,harness,workspace,lane,status:'starting',startedAt:stamp(),lastSeen:stamp(),calls:0,failures:0,lastError:null,lastCapability:null};
  let closed=false,writeError=null;
  const flush=()=>{if(closed)return;state.lastSeen=new Date(clock()).toISOString();try{write(dir,id,state);writeError=null;}catch(e){writeError=e.code||'CONTROL_WRITE_FAILED';}};
  write(dir,id,state);
  const capabilityIds=new Set(engine.list().map(x=>x.id));
  const heartbeat=setInterval(flush,15000);heartbeat.unref();
  return {engine:{...engine,async invoke(capability,args,options){
    state.status='connected';state.calls++;state.lastCapability=capabilityIds.has(capability)?capability:'unknown';
    try{const result=await engine.invoke(capability,args,options);if(result?.ok===false){state.failures++;state.lastError=/^[A-Z0-9_]{1,80}$/.test(result.error)?result.error:'DOMAIN_REFUSAL';}return result;}
    catch(e){state.failures++;state.lastError=observationError(e,'EXECUTION_FAILED');throw e;}
    finally{flush();}
  }},connected(){if(state.status!=='connected'){state.status='connected';flush();}},get recordingError(){return writeError;},close(){if(closed)return;state.status='closed';flush();closed=true;clearInterval(heartbeat);}};
}

/** Test records are supplied only by the explicit host runner, never an MCP tool. */
export function saveTestRun(brain,project,record){
  brain.project(project);identifier(record.id);
  ensure(record.project===project&&['running','passed','failed','cancelled','timed_out'].includes(record.status),'INVALID_TEST_RUN');
  const dir=directory(brain.home,projectKey(project),'runs');
  const archived=readDirectory(brain.home,projectKey(project),'run-archive');
  if(archived&&fs.existsSync(path.join(archived,record.id+'.json'))){
    ensure(hash(read(path.join(archived,record.id+'.json')))===hash({schemaVersion:1,...record}),'CONTROL_RUN_ARCHIVED');return {id:record.id,status:record.status,archived:true};
  }
  if(!fs.existsSync(path.join(dir,record.id+'.json'))){
    const current=records(brain.home,[projectKey(project),'runs'],MAX_RUNS);
    if(current.items.length>=MAX_RUNS){
      const oldest=current.items.filter(x=>['passed','failed','cancelled','timed_out'].includes(x.status)).sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt))[0];
      ensure(oldest,'CONTROL_RUN_QUOTA');archiveTestRun(brain,project,oldest.id);
    }
  }
  write(dir,record.id,record);return {id:record.id,status:record.status};
}
export function archiveTestRun(brain,project,id){
  brain.project(project);identifier(id);
  const dir=readDirectory(brain.home,projectKey(project),'runs'),archive=directory(brain.home,projectKey(project),'run-archive');
  const source=dir&&path.join(dir,id+'.json'),target=path.join(archive,id+'.json');
  if(!source||!fs.existsSync(source)){ensure(fs.existsSync(target),'TEST_RUN_NOT_FOUND');return {id,archived:true};}
  const record=read(source);ensure(record.project===project&&['passed','failed','cancelled','timed_out'].includes(record.status),'TEST_RUN_NOT_TERMINAL');
  if(fs.existsSync(target))ensure(hash(read(target))===hash(record),'CONTROL_ARCHIVE_CONFLICT');
  else fs.linkSync(source,target); // Exclusive destination; a crash leaves two recoverable links.
  fs.unlinkSync(source);return {id,archived:true};
}

/** A trusted editor extension reports its current folders, not chat history. No project grant is created. */
export function workspaceSeen(home,{root,harness,session}){
  identifier(harness);identifier(session);ensure(['vscode','antigravity'].includes(harness),'UNKNOWN_EDITOR');
  ensure(path.isAbsolute(root),'ABSOLUTE_WORKSPACE_REQUIRED');const workspace=fs.realpathSync.native(root);
  ensure(fs.statSync(workspace).isDirectory()&&workspace!==path.parse(workspace).root,'UNSAFE_PROJECT_ROOT');
  const dir=directory(home,'editors'),id=hash({workspace,harness,session}).slice(0,32);
  const current=records(home,['editors'],256);
  if(!current.items.some(x=>x.id===id)&&current.items.length>=256){
    const old=current.items.filter(x=>Date.now()-Date.parse(x.lastSeen)>LEASE_MS).sort((a,b)=>Date.parse(a.lastSeen)-Date.parse(b.lastSeen))[0];
    ensure(old,'CONTROL_EDITOR_QUOTA');identifier(old.id);fs.unlinkSync(path.join(dir,old.id+'.json'));
  }
  const result={id,harness,workspace,session,lastSeen:stamp(),source:'editor-workspace-api'};write(dir,id,result);return result;
}
export function discoverOpenWorkspaces(home,{now=Date.now()}={}){
  const found=records(home,['editors'],256);
  return {...found,items:found.items.filter(x=>typeof x.workspace==='string'&&['vscode','antigravity'].includes(x.harness)).map(x=>({...x,status:now-Date.parse(x.lastSeen)<=LEASE_MS?'open':'stale'})),leaseMs:LEASE_MS};
}
export function controlOverview(brain,project){
  const identity=brain.project(project),key=projectKey(project), sessions=records(brain.home,[key,'sessions'],MAX_SESSIONS),runs=records(brain.home,[key,'runs'],MAX_RUNS);
  const memories=brain.db.prepare('SELECT status,count(*) n FROM memories WHERE project=? GROUP BY status').all(project);
  const workspaces=readWorkspaceOverview(brain,project),usage=usageOverview(brain,project);
  const canonicalRoot=root=>{try{verifyRoot(root);return fs.realpathSync.native(root);}catch{return null;}};
  const roots=new Set([identity.root,...workspaces.lanes.map(x=>x.root)].map(canonicalRoot).filter(Boolean)),open=discoverOpenWorkspaces(brain.home);
  return {schemaVersion:1,project:identity,generatedAt:stamp(),workspaces,tasks:workspaces.primary.tasks,
    memories:Object.fromEntries(['approved','proposed','revoked'].map(k=>[k,memories.find(x=>x.status===k)?.n??0])),
    activity:sessions.items.filter(x=>x.project===project).sort((a,b)=>Date.parse(b.lastSeen)-Date.parse(a.lastSeen)).map(x=>({...x,status:x.status==='closed'?'closed':Date.now()-Date.parse(x.lastSeen)>LEASE_MS?'stale':x.status})),
    runs:runs.items.filter(x=>x.project===project).sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)).slice(0,50),
    usage,budget:budgetOverview(brain,project,usage.usage),integrations:discoverIntegrations(),openWorkspaces:{...open,items:open.items.flatMap(x=>{const workspace=canonicalRoot(x.workspace);return workspace&&roots.has(workspace)?[{...x,workspace}]:[];})},
    coverage:{activity:'Somente processos MCP BBrainX instrumentados; presença de configuração não confirma conexão.',tests:'Até 50 resultados da janela ativa de 128; terminais antigos são arquivados localmente. Código local não está em sandbox de SO.',retention:'Metadados de conexão: janela cooperativa de 256, com substituição de encerrados/stale. Arquivos de testes arquivados são preservados; não é quota global de disco.',costs:'Somente recibos importados; gastos de outras chamadas permanecem desconhecidos.',sessionLeaseMs:LEASE_MS,truncated:sessions.truncated||runs.truncated||runs.items.length>50||workspaces.truncated,invalidRecords:sessions.invalid+runs.invalid}};
}
