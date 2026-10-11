import { BrainStore } from '../store.mjs';
import { ensure, hash } from '../primitives.mjs';
import { LaneRegistry } from './registry.mjs';
import { EngineError } from '../capability.mjs';

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
  /** Lock order is lane -> registry -> memory authority, and nothing that holds the registry or the authority ever waits for a lane
   * database. The lane write lock is taken first and waited for with no shared lock held (a big index in another process can hold it
   * for seconds); only then, around the lane COMMIT itself, does the registry confirm the lane epoch is still active and the
   * authority confirm the approved-memory revision. Closing a lane takes the registry lock, so it either completes before this gate
   * (the write is rolled back, LANE_NOT_ACTIVE) or waits until the commit is done: no write survives in a closed epoch. */
  #gate(inner){
    return commit=>this.registry.transaction(()=>{
      this.registry.active(this.scopeProject,this.binding.id,this.binding.epoch);
      inner(commit);
    });
  }
  commitContextEvent(project,payload){
    this.checkProject(project);const memory=this.#capture();
    super.commitContextEvent(project,{...payload,lane:this.binding.id,laneEpoch:this.binding.epoch,memoryRevision:memory.revision},this.#gate(commit=>
      this.authority.transaction(()=>{
        ensure(this.#readMemory().revision===memory.revision,'SHARED_MEMORY_CHANGED');
        commit();
      })));
  }
  checkpoint(project,task,content,expectedVersion,key){this.checkProject(project);return super.checkpoint(project,task,content,expectedVersion,key,this.#gate(commit=>commit()));}
  workspaceMetadata(){return {project:this.scopeProject,lane:this.binding.id,epoch:this.binding.epoch,root:this.binding.root,memoryAuthority:'project',checkpointScope:'workspace',isolation:'cooperative-not-os-sandbox'};}
  close(){try{super.close();}finally{try{this.authority.close();}finally{this.registry.close();}}}
}

/** Admitted requests per lane process (running + waiting); equals the MCP handler's default in-flight limit (asserted in
 * lanes-mcp.test.mjs), so a burst from one harness is refused by the handler, never by the lane first. */
export const LANE_QUEUE_DEPTH=8;
/** Longest a request waits for its turn. A capability run is capped at 30 s by the engine; a longer wait means a stuck
 * operation, and the requester gets a retryable refusal instead of an open-ended hang. */
export const LANE_QUEUE_WAIT_MS=30000;
const cancelled=signal=>new EngineError('CANCELLED','Capability invocation was cancelled.',{cause:signal.reason});

/** Bound host engine. A single operation at a time per process (the transient approved-memory view is per operation), but
 * parallel requests from one harness wait in a bounded FIFO queue instead of failing: at most `depth` are admitted, a waiting
 * entry leaves when its AbortSignal fires or after `maxWaitMs`, and only a request beyond those bounds gets LANE_BUSY.
 * Separate lane processes still run side by side. */
export function bindLaneEngine(engine,store,{depth=LANE_QUEUE_DEPTH,maxWaitMs=LANE_QUEUE_WAIT_MS}={}){
  if(!Number.isSafeInteger(depth)||depth<1||depth>128||!Number.isSafeInteger(maxWaitMs)||maxWaitMs<1||maxWaitMs>600000)throw new TypeError('INVALID_LANE_QUEUE_OPTIONS');
  let running=false;const waiting=[];
  const busy=detail=>({ok:false,data:null,error:'LANE_BUSY',detail});
  // The seat is handed over without ever clearing `running`, so a newcomer cannot overtake the head of the queue.
  const release=()=>{const next=waiting.shift();if(next)next.grant();else running=false;};
  function takeTurn(signal){
    if(!running){running=true;return null;}
    if(1+waiting.length>=depth)return Promise.resolve(busy('Lane queue is full ('+depth+' requests admitted); retry when one settles.'));
    return new Promise((resolve,reject)=>{
      const entry={grant(){leave();resolve(null);}};
      const leave=()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);};
      const drop=()=>{const at=waiting.indexOf(entry);if(at>=0)waiting.splice(at,1);leave();};
      const onAbort=()=>{drop();reject(cancelled(signal));};
      const timer=setTimeout(()=>{drop();resolve(busy('Waited '+maxWaitMs+' ms for the lane without a turn; retry.'));},maxWaitMs);
      signal?.addEventListener('abort',onAbort,{once:true});waiting.push(entry);
    });
  }
  return {...engine,
    list:()=>engine.list(),describe:id=>engine.describe(id),
    async invoke(id,args,options){
      const signal=options?.signal;
      if(signal?.aborted)throw cancelled(signal);
      const refused=await takeTurn(signal);
      if(refused)return refused;
      try {
        store.beginOperation();
        const result=await engine.invoke(id,args,options);
        store.registry.active(store.scopeProject,store.binding.id,store.binding.epoch);
        if(result.ok&&result.data&&typeof result.data==='object'&&!Array.isArray(result.data))result.data={...result.data,workspace:store.workspaceMetadata()};
        return result;
      } catch(e){if(e.name==='BrainError')return {ok:false,data:null,error:e.code,detail:e.message};throw e;}
      finally{store.endOperation();release();}
    }
  };
}
