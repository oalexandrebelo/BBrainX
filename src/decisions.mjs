import { z } from 'zod';
import { ensure, hash } from './primitives.mjs';
import { verifyRoot } from './source-root.mjs';
import { LAYA, LayaBroker, layaStatus } from './laya.mjs';

const name=z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/);
const description=z.string().min(1).max(160);
const instructions=z.string().min(1).max(400);
const choiceCriteria=z.record(name,description).refine(value=>Object.keys(value).length>=2&&Object.keys(value).length<=6,'Use 2–6 options.');
const question=z.discriminatedUnion('type',[
  z.object({type:z.literal('choice'),instructions,criteria:choiceCriteria}).strict(),
  z.object({type:z.literal('score'),instructions,criteria:z.array(description).min(2).max(6)}).strict(),
  z.object({type:z.literal('noul'),instructions,criteria:z.object({false:description,true:description}).strict()}).strict()
]);
export const decisionShape={
  state:z.string().min(1).max(4000),
  questions:z.record(name,question).refine(value=>Object.keys(value).length>=1&&Object.keys(value).length<=4,'Use 1–4 questions.')
};
const requestSchema=z.object({project:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/),...decisionShape}).strict();
const model=Object.freeze({package:LAYA.package+' '+LAYA.version,checkpoint:LAYA.checkpoint,revision:LAYA.revision});
const MAX_ENTRIES=64, MAX_CACHE_BYTES=131072, IDLE_MS=120000;

/** Opt-in, read-only suggestions over caller-provided text. Never reads project content. */
export class LocalDecisions{
  #broker;#home;#timer=null;#cache=new Map();#bytes=0;#generation=null;#closed=false;
  constructor({home,broker}={}){this.#home=home;this.#broker=broker||new LayaBroker({home,deadlineMs:25000});}
  status(){
    const profile=layaStatus(this.#home);
    return {enabled:true,installed:profile.installed,ready:!!this.#broker.info,model,calibrated:false};
  }
  #clear(){this.#cache.clear();this.#bytes=0;this.#generation=null;}
  #idle(){clearTimeout(this.#timer);if(this.#closed)return;this.#timer=setTimeout(()=>{this.#broker.stop();this.#clear();},IDLE_MS);this.#timer.unref();}
  async evaluate(store,args,{signal}={}){
    const started=performance.now(),parsed=requestSchema.safeParse(args);
    ensure(parsed.success,'INVALID_DECISION');
    ensure(!this.#closed,'LAYA_CLOSED');signal?.throwIfAborted();
    const {project,state,questions}=parsed.data;
    // Authorization belongs to the engine; verify the registered root on every call, including cache hits.
    verifyRoot(store.project(project).root);
    ensure(this.status().installed,'LAYA_NOT_INSTALLED');
    if(this.#generation!==this.#broker.info)this.#clear();
    // Option insertion order affects the model; canonical JSON sorting would alias distinct questions.
    const key=hash(JSON.stringify({schema:1,project,root:store.project(project).root,model,state,questions,maxLen:2048,strictHead:true}));
    const cached=this.#cache.get(key);
    if(cached){
      this.#cache.delete(key);this.#cache.set(key,cached);this.#idle();
      return {...JSON.parse(cached.json),cache:'hit',workerMs:0,elapsedMs:performance.now()-started};
    }
    clearTimeout(this.#timer);
    const reply=await this.#broker.decide([state],questions,{signal,maxLen:2048,strictHead:true,deadlineMs:25000});
    this.#idle();signal?.throwIfAborted();
    ensure(reply.ok,'LAYA_'+reply.reason);
    verifyRoot(store.project(project).root);
    const result=reply.results[0];
    ensure(typeof result.headTruncated==='boolean','LAYA_PREFLIGHT_REQUIRED');
    const abstained=result.truncated||result.headTruncated;
    const data={status:abstained?'abstained':'suggested',answers:abstained?{}:result.answers,
      truncated:result.truncated,headTruncated:result.headTruncated,headWarnings:result.headWarnings,stateTokensDropped:result.stateTokensDropped,
      inputTokens:result.inputTokens,calibrated:false,model,runtime:{...this.#broker.info},
      cache:'miss',workerMs:reply.ms,elapsedMs:performance.now()-started};
    if(!abstained){
      if(this.#generation!==this.#broker.info)this.#clear();
      this.#generation=this.#broker.info;
      // Keys contain a digest only. The bounded cache retains result JSON, never the supplied state.
      const json=JSON.stringify(data),bytes=Buffer.byteLength(json)+key.length;
      if(bytes<=MAX_CACHE_BYTES){
        while(this.#cache.size>=MAX_ENTRIES||this.#bytes+bytes>MAX_CACHE_BYTES){
          const oldest=this.#cache.keys().next().value;this.#bytes-=this.#cache.get(oldest).bytes;this.#cache.delete(oldest);
        }
        this.#cache.set(key,{json,bytes});this.#bytes+=bytes;
      }
    }
    return data;
  }
  close(){this.#closed=true;clearTimeout(this.#timer);this.#broker.stop();this.#clear();}
}

export const disabledDecisions=()=>({enabled:false,installed:false,ready:false,model,calibrated:false});
