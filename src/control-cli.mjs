import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { BrainStore } from './store.mjs';
import { stateHome } from './host.mjs';
import { ensure,identifier } from './primitives.mjs';
import { verifyRoot } from './source-root.mjs';
import { LANE_SCHEMA,LANE_SCHEMA_HASH,gitWorkspace } from './lanes/registry.mjs';
import { planIntegrations,applyIntegrationPlan,rollbackIntegration,discoverIntegrations } from './integrations.mjs';
import { workspaceSeen,discoverOpenWorkspaces,controlOverview,saveTestRun,archiveTestRun } from './control.mjs';

export const CONTROL_COMMANDS=['integrate','integrations','discover','workspace-seen','control','test','test-history','import-context','budget'];
function catalog(home){
  const file=path.join(home,'brain.sqlite');if(!fs.existsSync(file))return [];
  ensure(!fs.lstatSync(file).isSymbolicLink(),'UNSAFE_DB_PATH');
  const db=new DatabaseSync(file,{readOnly:true});try{return db.prepare('SELECT id,root FROM projects LIMIT 10001').all().map(record=>{
    let root;try{verifyRoot(record.root);root=fs.realpathSync.native(record.root);}catch{root=record.root;}
    return {...record,root};
  });}finally{db.close();}
}
function projectId(root,known,requested){return requested||known.find(x=>x.root===root)?.id||path.basename(root).replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^[^A-Za-z0-9]+/,'').slice(0,80).replace(/[^A-Za-z0-9]+$/,'')||'project';}
function integrationNode(){
  const node=process.env.BBRAINX_NODE??process.execPath;
  ensure(path.isAbsolute(node)&&!/[\u0000-\u001f\u007f]/.test(node),'INVALID_INTEGRATION_NODE');
  let resolved;
  try{resolved=fs.realpathSync.native(node);}catch{ensure(false,'INVALID_INTEGRATION_NODE');}
  ensure(resolved===fs.realpathSync.native(process.execPath),'INTEGRATION_NODE_MISMATCH');
  return node;
}
function readLaneBinding(home,project,lane,root,known){
  identifier(project);identifier(lane);const primary=known.find(item=>item.id===project);ensure(primary,'PROJECT_NOT_REGISTERED');
  const file=path.join(home,'lanes-v1.sqlite');ensure(fs.existsSync(file),'LANE_NOT_ACTIVE');
  ensure(!fs.lstatSync(file).isSymbolicLink()&&fs.statSync(file).isFile(),'UNSAFE_LANE_DB');
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    db.exec('BEGIN DEFERRED');
    ensure(db.prepare('PRAGMA user_version').get().user_version===LANE_SCHEMA,'LANE_SCHEMA_VERSION');
    ensure(db.prepare("SELECT value FROM lane_meta WHERE key='schema'").get()?.value===LANE_SCHEMA_HASH,'LANE_SCHEMA_HASH');
    const binding=db.prepare('SELECT root,common_root,epoch,status FROM lanes WHERE project=? AND id=?').get(project,lane);
    ensure(binding?.status==='active','LANE_NOT_ACTIVE');ensure(binding.root===root,'WORKSPACE_BINDING_MISMATCH');
    const main=gitWorkspace(primary.root),workspace=gitWorkspace(root);
    ensure(main.root===primary.root&&workspace.root===binding.root&&workspace.common===binding.common_root&&main.common===workspace.common,'WORKSPACE_BINDING_CHANGED');
    db.exec('COMMIT');return binding;
  }finally{db.close();}
}

export async function controlCommand(command,v,args){
  const home=stateHome();
  if(command==='workspace-seen')return workspaceSeen(home,{root:v.root,harness:v.harness,session:v.session});
  if(command==='integrations'){
    if(args[1]==='rollback'){ensure(v.id,'RECEIPT_REQUIRED');return rollbackIntegration({home,id:v.id});}
    ensure(!args[1],'UNKNOWN_INTEGRATION_COMMAND');return discoverIntegrations();
  }
  if(command==='discover'){
    const {discoverHarnessContexts}=await import('./context-import.mjs');
    return {open:discoverOpenWorkspaces(home),registered:catalog(home),history:discoverHarnessContexts({root:v.root}),clients:discoverIntegrations()};
  }
  if(command==='integrate'){
    const node=integrationNode();
    const root=fs.realpathSync.native(path.resolve(v.root||process.cwd())),known=catalog(home),project=projectId(root,known,v.project);
    let laneStore,binding;
    try{
      if(v.lane){
        binding=readLaneBinding(home,project,v.lane,root,known);
      }else{
        const existing=known.find(x=>x.id===project);ensure(!existing||existing.root===root,'PROJECT_ROOT_CONFLICT');
        for(const other of known)if(other.id!==project){
          const a=path.relative(other.root,root),b=path.relative(root,other.root),inside=r=>r===''||(!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep));
          ensure(!inside(a)&&!inside(b),'PROJECT_ROOT_OVERLAP');
        }
      }
      const entry=process.env.BBRAINX_ENTRY||fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url));
      const plan=planIntegrations({root,project,lane:v.lane,home,node,entry,clients:v.clients?.split(','),adoptExisting:v['adopt-existing']===true});
      if(!v.apply)return plan;
      ensure(!plan.files.some(x=>x.status==='blocked'),'INTEGRATION_PLAN_BLOCKED');
      if(v.lane){
        const {LaneStore}=await import('./lanes/store.mjs');laneStore=new LaneStore(home,project,v.lane);
        ensure(laneStore.binding.root===root&&laneStore.binding.epoch===binding.epoch,'WORKSPACE_BINDING_CHANGED');
      }
      const brain=laneStore||new BrainStore(home);
      try{
        if(!laneStore)brain.register(project,root);
        const receipt=applyIntegrationPlan(plan);
        const {indexProject}=await import('./retrieval.mjs');let index;
        try{index=indexProject(brain,project);}catch(e){process.exitCode=1;return {project,root,plan,receipt,indexError:e.code||'INDEX_FAILED',next:'Configuração aplicada; índice incompleto. Corrija a indexação ou use integrations rollback com o recibo.'};}
        return {project,root,lane:v.lane??null,plan,receipt,index:{files:index.files,snapshot:index.snapshot},next:'Recarregue as conexões MCP no harness. Trust e aprovação continuam sob controle do cliente.'};
      }finally{if(!laneStore)brain.close();}
    }finally{laneStore?.close();}
  }
  const brain=new BrainStore(home);
  try{
    ensure(v.project,'PROJECT_REQUIRED');brain.project(v.project);
    if(command==='control')return controlOverview(brain,v.project);
    if(command==='test-history'){ensure(args[1]==='archive'&&v.id,'RUN_ARCHIVE_REQUIRED');return archiveTestRun(brain,v.project,v.id);}
    if(command==='budget'){
      const {setBudget}=await import('./budget.mjs');return setBudget(brain,{project:v.project,amount:v.amount,currency:v.currency,basis:v.basis,expectedVersion:Number(v.version||0)});
    }
    if(command==='test'){
      ensure(v.file,'FILE_REQUIRED');const {runProjectTests}=await import('./test-runner.mjs');
      const controller=new AbortController(),abort=()=>controller.abort();let result;
      process.once('SIGINT',abort);process.once('SIGTERM',abort);
      try{result=await runProjectTests(brain,{project:v.project,task:v.task||'tests',files:v.file.split(','),timeoutMs:Number(v.timeout||300000),signal:controller.signal,onUpdate:record=>saveTestRun(brain,v.project,record)});}
      finally{process.off('SIGINT',abort);process.off('SIGTERM',abort);}
      if(result.status!=='passed')process.exitCode=1;return result;
    }
    if(command==='import-context'){
      ensure(v.file&&v.harness,'FILE_AND_HARNESS_REQUIRED');const {importHarnessContext}=await import('./context-import.mjs');
      return importHarnessContext(brain,{project:v.project,file:v.file,harness:v.harness,task:v.task,confirmedWorkspace:v['confirm-workspace'],expectedVersion:v.version===undefined?undefined:Number(v.version)});
    }
    ensure(false,'UNKNOWN_CONTROL_COMMAND');
  }finally{brain.close();}
}
