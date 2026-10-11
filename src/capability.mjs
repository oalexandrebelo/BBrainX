import { randomUUID } from 'node:crypto';
import { composeCapabilityLibraries } from './capability-composition.mjs';

/**
 * Motor de capacidades do BBrainX: uma capacidade declara entrada, saída, acesso e prazo; o motor valida,
 * autoriza, limita o tempo e devolve um erro de código estável. O contrato segue o modelo do Invokta 0.9
 * (MIT, vinilana/invokta — ver THIRD_PARTY_NOTICES.md); a implementação é própria e não depende dele.
 * Esquemas entram pelo protocolo Standard Schema (`~standard`), sem acoplar o motor a uma biblioteca.
 */
export class EngineError extends Error {
  constructor(code,message,{publicDetails,cause}={}){
    super(message,cause===undefined?undefined:{cause});this.name='EngineError';this.code=code;
    if(publicDetails!==undefined)this.publicDetails=publicDetails;
  }
}
export const ERROR_CODES=Object.freeze(['CAPABILITY_NOT_FOUND','INPUT_INVALID','UNAUTHENTICATED','FORBIDDEN','OUTPUT_INVALID','CANCELLED','TIMEOUT','EXECUTION_FAILED']);
export const defineCapability=definition=>definition;

const MAX_TIMEOUT_MS=2147483647;
function pathOf(issue){
  if(!Array.isArray(issue.path))return undefined;
  return issue.path.map(part=>typeof part==='object'&&part!==null?part.key:part).map(key=>typeof key==='number'?key:String(key));
}
async function validate(schema,value,code,message){
  let result;
  try{result=await schema['~standard'].validate(value);}catch(cause){throw new EngineError(code,message,{cause});}
  if(result.issues){
    const issues=result.issues.map(issue=>{const path=pathOf(issue);return path?{message:String(issue.message),path}:{message:String(issue.message)};});
    throw new EngineError(code,message,{publicDetails:{issues}});
  }
  return result.value;
}
function jsonSchema(schema,side,capabilityId){
  const convert=schema?.['~standard']?.jsonSchema?.[side];
  if(typeof convert!=='function')throw new TypeError('Capability '+capabilityId+' needs a schema that can describe its '+side+' as JSON Schema.');
  const document=convert.call(schema['~standard'].jsonSchema,{target:'draft-2020-12'});
  if(document?.type!=='object')throw new TypeError('Capability '+capabilityId+' '+side+' schema must have an object root.');
  return JSON.parse(JSON.stringify(document));
}
function snapshotPrincipal(value){
  if(value===null||value===undefined)return null;
  if(typeof value!=='object'||typeof value.id!=='string'||!value.id)throw new EngineError('UNAUTHENTICATED','Authentication is required.');
  return structuredClone({id:value.id,...(value.attributes===undefined?{}:{attributes:value.attributes})});
}
async function enforceAccess(capabilityId,capability,input,context){
  if(capability.access==='public')return;
  if(capability.access==='authenticated'&&context.principal!==null)return;
  if(typeof capability.access==='function'&&await capability.access({principal:context.principal,input,context,capabilityId})===true)return;
  if(context.principal===null)throw new EngineError('UNAUTHENTICATED','Authentication is required.');
  throw new EngineError('FORBIDDEN','Capability access is forbidden.');
}
const timedOut=Symbol('timeout');
/** Liga o sinal de quem chama ao prazo da capacidade. O motivo do aborto distingue prazo de cancelamento. */
function deadline(received,timeoutMs){
  const controller=new AbortController();let timer;
  const expiresAt=timeoutMs===undefined?Infinity:performance.now()+timeoutMs;
  const forward=()=>controller.abort(received.reason);
  if(received){if(received.aborted)forward();else received.addEventListener('abort',forward,{once:true});}
  if(timeoutMs!==undefined)timer=setTimeout(()=>controller.abort(timedOut),timeoutMs);
  return {signal:controller.signal,
    check(){
      // Timer não preempta código síncrono: conferir também na fronteira de cada etapa.
      if(!controller.signal.aborted&&performance.now()>=expiresAt)controller.abort(timedOut);
      if(controller.signal.aborted)throw interrupted(controller.signal);
    },
    cleanup(){clearTimeout(timer);received?.removeEventListener('abort',forward);}};
}
function interrupted(signal){
  return signal.reason===timedOut?new EngineError('TIMEOUT','Capability invocation timed out.'):new EngineError('CANCELLED','Capability invocation was cancelled.',{cause:signal.reason});
}
function race(work,signal){
  // O trabalho abandonado por prazo ou cancelamento ainda pode rejeitar depois: sem dono, essa rejeição derrubaria o processo.
  work.catch(()=>{});
  if(signal.aborted)return Promise.reject(interrupted(signal));
  return new Promise((resolve,reject)=>{
    const onAbort=()=>reject(interrupted(signal));
    signal.addEventListener('abort',onAbort,{once:true});
    work.then(resolve,reject).finally(()=>signal.removeEventListener('abort',onAbort));
  });
}

/**
 * `onEvent` recebe invocation.started|completed|failed com identificador, capacidade, duração e código; nunca
 * recebe argumentos nem resultado. Falha no observador não muda o resultado da chamada.
 */
export function createEngine({name,version,capabilities={},libraries=[],onEvent}){
  const composed=composeCapabilityLibraries(libraries,capabilities);
  const registry=new Map(), descriptions=new Map();
  for(const [id,capability] of Object.entries(composed.capabilities)){
    const {timeoutMs}=capability;
    if(timeoutMs!==undefined&&(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>MAX_TIMEOUT_MS))throw new TypeError('Capability '+id+' timeoutMs must be an integer from 1 through '+MAX_TIMEOUT_MS+'.');
    registry.set(id,Object.freeze({...capability}));
    descriptions.set(id,Object.freeze({id,description:capability.description,...(capability.title===undefined?{}:{title:capability.title}),...(capability.annotations===undefined?{}:{annotations:Object.freeze({...capability.annotations})}),...(timeoutMs===undefined?{}:{timeoutMs}),inputSchema:jsonSchema(capability.input,'input',id),outputSchema:jsonSchema(capability.output,'output',id)}));
  }
  const emit=event=>{if(!onEvent)return;try{Promise.resolve(onEvent(event)).catch(()=>{});}catch{/* observador não interfere */}};
  const notFound=id=>new EngineError('CAPABILITY_NOT_FOUND','Capability not found.',{publicDetails:{capabilityId:id}});
  return {
    name,version,
    provenance:()=>structuredClone(composed.provenance),
    list:()=>[...descriptions.values()].map(({id,description,title,annotations})=>({id,description,...(title===undefined?{}:{title}),...(annotations===undefined?{}:{annotations:structuredClone(annotations)})})),
    describe(id){const description=descriptions.get(id);if(!description)throw notFound(id);return structuredClone(description);},
    async invoke(id,rawInput,{principal=null,source='direct',signal,requestId=randomUUID()}={}){
      const started=performance.now();let limit;
      emit({type:'invocation.started',requestId,capabilityId:id,source,startedAt:new Date().toISOString()});
      try{
        const capability=registry.get(id);if(!capability)throw notFound(id);
        // O prazo é da invocação inteira: entrada, acesso, execução e saída.
        limit=deadline(signal,capability.timeoutMs);limit.check();
        // Capture dados do chamador antes do primeiro await; sem referências mutáveis atravessando etapas.
        const receivedInput=structuredClone(rawInput), receivedPrincipal=structuredClone(principal);
        const stage=async work=>{
          limit.check();
          const result=await race(Promise.resolve().then(()=>{limit.check();return work();}),limit.signal);
          limit.check();return result;
        };
        const input=structuredClone(await stage(()=>validate(capability.input,receivedInput,'INPUT_INVALID','Capability input validation failed.')));
        const who=snapshotPrincipal(receivedPrincipal);
        await stage(()=>enforceAccess(id,capability,structuredClone(input),Object.freeze({requestId,source,principal:structuredClone(who),signal:limit.signal})));
        const context=Object.freeze({requestId,source,principal:who,signal:limit.signal});
        const raw=await stage(()=>capability.run({input,context}));
        const output=await stage(()=>validate(capability.output,raw,'OUTPUT_INVALID','Capability output validation failed.'));
        emit({type:'invocation.completed',requestId,capabilityId:id,durationMs:performance.now()-started});
        return output;
      }catch(cause){
        // Só erro do próprio motor atravessa com código e mensagem; qualquer outro vira EXECUTION_FAILED sem detalhe.
        const error=limit?.signal.aborted?interrupted(limit.signal):cause instanceof EngineError&&ERROR_CODES.includes(cause.code)?cause:new EngineError('EXECUTION_FAILED','Capability execution failed.',{cause});
        emit({type:'invocation.failed',requestId,capabilityId:id,durationMs:performance.now()-started,code:error.code});
        throw error;
      }finally{limit?.cleanup();}
    }
  };
}
