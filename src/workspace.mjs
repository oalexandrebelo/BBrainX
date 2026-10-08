import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensure, hash, identifier } from './primitives.mjs';
import { verifyRoot } from './source-root.mjs';
import { BRAIN_SCHEMA_VERSION, BRAIN_SCHEMA_HASH, normalizeCheckpoint } from './store.mjs';
import { LANE_SCHEMA, LANE_SCHEMA_HASH } from './lanes/registry.mjs';

const inside=(root,candidate)=>{const relative=path.relative(root,candidate);return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep));};
function directory(value){
  ensure(typeof value==='string'&&path.isAbsolute(value),'WORKSPACE_REQUIRED');
  let actual;
  try{actual=fs.realpathSync.native(value);ensure(fs.statSync(actual).isDirectory(),'INVALID_WORKSPACE_ROOT');}
  catch(error){if(error.name==='BrainError')throw error;ensure(false,'INVALID_WORKSPACE_ROOT');}
  return actual;
}

/** A startup check for a host-selected workspace; caller arguments never grant another project. */
export function assertWorkspaceBinding(store,{project,workspace,lane},cwd=process.cwd()){
  const registered=store.project(project).root;verifyRoot(registered);
  const root=directory(registered),selected=directory(workspace),current=directory(cwd);
  ensure(selected===root,'WORKSPACE_BINDING_MISMATCH');
  ensure(inside(root,current),'WORKSPACE_CWD_MISMATCH');
  const authority=store.authority??store;
  ensure(authority.projects().every(other=>other.id===project||!inside(other.root,current)),'WORKSPACE_PROJECT_CONFLICT');
  if(store.binding){
    ensure(lane===undefined||lane===store.binding.id,'WORKSPACE_LANE_MISMATCH');
    store.registry.verifyBinding(project,store.binding.id,store.binding.epoch);
    return {project,workspace:root,lane:store.binding.id,epoch:store.binding.epoch};
  }
  ensure(lane===undefined,'WORKSPACE_LANE_MISMATCH');
  return {project,workspace:root};
}

const overviewLimits=Object.freeze({activeLanes:16,lanes:32,tasksPerWorkspace:20,checkpointBytes:16384});
function readDatabase(file,{version,schema,meta},read){
  ensure(!fs.lstatSync(file).isSymbolicLink()&&fs.statSync(file).isFile(),'UNSAFE_WORKSPACE_DB');
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    db.exec('BEGIN DEFERRED');
    ensure(db.prepare('PRAGMA user_version').get().user_version===version,'WORKSPACE_SCHEMA_VERSION');
    ensure(db.prepare('SELECT value FROM '+meta+" WHERE key='schema'").get()?.value===schema,'WORKSPACE_SCHEMA_HASH');
    const result=read(db);db.exec('COMMIT');return result;
  }finally{db.close();}
}
function readTasks(db,project){
  const rows=db.prepare('SELECT id,version,CASE WHEN length(CAST(body AS BLOB))<=? THEN body END AS body,updated FROM tasks WHERE project=? ORDER BY updated DESC,id LIMIT ?').all(overviewLimits.checkpointBytes,project,overviewLimits.tasksPerWorkspace+1);
  const tasks=rows.slice(0,overviewLimits.tasksPerWorkspace).map(row=>{
    identifier(row.id);ensure(Number.isSafeInteger(row.version)&&row.version>0&&typeof row.body==='string','INVALID_WORKSPACE_CHECKPOINT');
    const content=JSON.parse(row.body);ensure(content&&typeof content==='object'&&!Array.isArray(content),'INVALID_WORKSPACE_CHECKPOINT');
    const {host,...declared}=content;normalizeCheckpoint(declared);
    ensure(typeof row.updated==='string'&&row.updated.length<=100,'INVALID_WORKSPACE_CHECKPOINT');
    return {id:row.id,version:row.version,updated:row.updated,content};
  });
  return {tasks,truncated:rows.length>overviewLimits.tasksPerWorkspace};
}
const readError=error=>error.name==='BrainError'?error.code:'WORKSPACE_STATE_UNREADABLE';

/** Bounded inspection only: never initialize/migrate a registry or lane database. */
export function readWorkspaceOverview(brain,project){
  const record=brain.project(project),home=fs.realpathSync.native(brain.home);
  const result={project,primary:{root:record.root,snapshot:record.snapshot,tasks:[]},lanes:[],registry:{state:'absent'},limits:{...overviewLimits},truncated:false};
  try{const primary=readTasks(brain.db,project);Object.assign(result.primary,primary);result.truncated=primary.truncated;}
  catch(error){result.primary.error=readError(error);}
  const registryFile=path.join(home,'lanes-v1.sqlite');
  if(!fs.existsSync(registryFile))return result;
  let bindings;
  try{
    bindings=readDatabase(registryFile,{version:LANE_SCHEMA,schema:LANE_SCHEMA_HASH,meta:'lane_meta'},db=>{
      const active=db.prepare("SELECT count(*) AS n FROM lanes WHERE project=? AND status='active'").get(project).n;
      ensure(active<=overviewLimits.activeLanes,'WORKSPACE_ACTIVE_LANE_LIMIT');
      return db.prepare("SELECT id,root,epoch,status FROM lanes WHERE project=? ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,id LIMIT ?").all(project,overviewLimits.lanes+1);
    });
    result.registry.state='available';result.truncated ||= bindings.length>overviewLimits.lanes;
  }catch(error){result.registry={state:'error',error:readError(error)};return result;}
  for(const binding of bindings.slice(0,overviewLimits.lanes)){
    const lane={id:binding.id,root:binding.root,epoch:binding.epoch,state:binding.status,snapshot:null,tasks:[],storage:'not_initialized'};
    try{
      identifier(binding.id);
      ensure(path.isAbsolute(binding.root)&&typeof binding.epoch==='string'&&binding.epoch.length<=100&&['active','closed'].includes(binding.status),'INVALID_WORKSPACE_BINDING');
      const lanesRoot=path.join(home,'lanes'),laneRoot=path.join(lanesRoot,hash({project,lane:binding.id})),file=path.join(laneRoot,'brain.sqlite');
      if(fs.existsSync(lanesRoot))ensure(!fs.lstatSync(lanesRoot).isSymbolicLink(),'UNSAFE_WORKSPACE_DB');
      if(fs.existsSync(laneRoot))ensure(!fs.lstatSync(laneRoot).isSymbolicLink(),'UNSAFE_WORKSPACE_DB');
      if(fs.existsSync(file)){
        const data=readDatabase(file,{version:BRAIN_SCHEMA_VERSION,schema:BRAIN_SCHEMA_HASH,meta:'meta'},db=>{
          const projects=db.prepare('SELECT id,root,snapshot FROM projects LIMIT 2').all();
          ensure(projects.length===1&&projects[0].id===project&&projects[0].root===binding.root,'WORKSPACE_DB_SCOPE_CONFLICT');
          return {snapshot:projects[0].snapshot,...readTasks(db,project)};
        });
        Object.assign(lane,data,{storage:'available'});result.truncated ||= data.truncated;
      }
    }catch(error){lane.storage='error';lane.error=readError(error);}
    result.lanes.push(lane);
  }
  return result;
}
