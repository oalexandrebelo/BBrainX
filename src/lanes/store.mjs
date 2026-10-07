import { BrainStore } from '../store.mjs';
import { ensure, hash } from '../primitives.mjs';
import { LaneRegistry } from './registry.mjs';

/** Lane index/checkpoints have their own database. Approved memory has exactly one authority. */
export class LaneStore extends BrainStore {
  #memoryView=null;
  constructor(home,project,lane){
    const registry=new LaneRegistry(home);
    let authority,opened=false;
    try {
      const binding=registry.verifyBinding(project,lane);
      authority=new BrainStore(home);
      const primary=authority.project(project);
      ensure(primary.root!==binding.root,'OVERLAPPING_WORKSPACE');
      super(registry.stateDirectory(project,lane));opened=true;
      this.registry=registry;this.authority=authority;this.binding=binding;this.scopeProject=project;
      super.register(project,binding.root);
    } catch(e){try{if(opened)super.close();}finally{try{authority?.close();}finally{registry.close();}}throw e;}
  }
  checkProject(project){ensure(project===this.scopeProject,'LANE_PROJECT_FORBIDDEN');this.registry.active(project,this.binding.id,this.binding.epoch);}
  beginOperation(){this.registry.verifyBinding(this.scopeProject,this.binding.id,this.binding.epoch);this.#memoryView=null;}
  endOperation(){this.#memoryView=null;}
  project(project){if(this.scopeProject)this.checkProject(project);return super.project(project);}
  #readMemory(){
    const project=this.scopeProject;
    const count=this.authority.approvedMemoryCount(project);
    ensure(count<=100,'APPROVED_MEMORY_LIMIT');
    const rows=this.authority.db.prepare("SELECT * FROM memories WHERE project=? AND status='approved' ORDER BY id").all(project);
    return {rows,count,revision:hash(rows.map(({id,version,statement,source,mode})=>({id,version,statement,source,mode})))};
  }
  #capture(){
    if(this.#memoryView)return this.#memoryView;
    this.authority.db.exec('BEGIN DEFERRED');
    try{this.#memoryView=this.#readMemory();this.authority.db.exec('COMMIT');return this.#memoryView;}
    catch(e){this.authority.db.exec('ROLLBACK');throw e;}
  }
  approvedMemoryCount(project){this.checkProject(project);return this.#capture().count;}
  memories(project,approvedOnly=false){this.checkProject(project);ensure(approvedOnly,'LANE_APPROVED_MEMORY_ONLY');return structuredClone(this.#capture().rows);}
  contextHeader(project){
    this.checkProject(project);
    return 'Workspace lane: '+this.binding.id+' [epoch: '+this.binding.epoch+']\n'+
      'Workspace root: '+this.binding.root+'\nApproved memory revision: '+this.#capture().revision+
      '\nCheckpoint and code belong to this workspace. Shared decisions do not certify another workspace snapshot.';
  }
  proposeMemory(project,statement,source,mode='always'){
    this.checkProject(project);
    return this.registry.transaction(()=>{
      this.registry.active(project,this.binding.id,this.binding.epoch);
      return this.authority.proposeMemory(project,statement,source,mode);
    });
  }
  reviewMemory(){ensure(false,'REVIEW_AT_PROJECT_AUTHORITY');}
  commitContextEvent(project,payload){
    this.checkProject(project);const memory=this.#capture();
    // Order: registry -> memory authority -> lane. No inference or filesystem work under these locks.
    this.registry.transaction(()=>{
      this.registry.active(project,this.binding.id,this.binding.epoch);
      this.authority.transaction(()=>{
        ensure(this.#readMemory().revision===memory.revision,'SHARED_MEMORY_CHANGED');
        super.commitContextEvent(project,{...payload,lane:this.binding.id,laneEpoch:this.binding.epoch,memoryRevision:memory.revision});
      });
    });
  }
  checkpoint(project,...args){this.checkProject(project);return this.registry.transaction(()=>{this.registry.active(project,this.binding.id,this.binding.epoch);return super.checkpoint(project,...args);});}
  workspaceMetadata(){return {project:this.scopeProject,lane:this.binding.id,epoch:this.binding.epoch,root:this.binding.root,memoryAuthority:'project',checkpointScope:'workspace',isolation:'cooperative-not-os-sandbox'};}
  close(){try{super.close();}finally{try{this.authority.close();}finally{this.registry.close();}}}
}

/** Bound host engine. One in-flight operation per process; clients can use separate lane processes. */
export function bindLaneEngine(engine,store){
  let active=false;
  return {...engine,
    list:()=>engine.list(),describe:id=>engine.describe(id),
    async invoke(id,args,options){
      if(active)return {ok:false,data:null,error:'LANE_BUSY',detail:'Este processo atende uma operação por vez; aguarde a conclusão.'};
      active=true;
      try {
        store.beginOperation();
        const result=await engine.invoke(id,args,options);
        store.registry.active(store.scopeProject,store.binding.id,store.binding.epoch);
        if(result.ok&&result.data&&typeof result.data==='object'&&!Array.isArray(result.data))result.data={...result.data,workspace:store.workspaceMetadata()};
        return result;
      } catch(e){if(e.name==='BrainError')return {ok:false,data:null,error:e.code,detail:e.message};throw e;}
      finally{store.endOperation();active=false;}
    }
  };
}
