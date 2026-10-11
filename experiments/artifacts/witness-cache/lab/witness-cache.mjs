import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export const VERSION = 'witness-cache-lab-v1';
export class CacheError extends Error {
  constructor(code) { super(code); this.name = 'CacheError'; this.code = code; }
}
const check = (ok, code) => { if (!ok) throw new CacheError(code); };
const id = x => typeof x === 'string' && x.length > 0 && x.length <= 128 && /^[A-Za-z0-9_.:/-]+$/.test(x);
const sha = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const natural = x => Number.isSafeInteger(x) && x >= 0;
const keyOf = (...x) => JSON.stringify(x);
export const digest = text => createHash('sha256').update(text).digest('hex');
const fields = (x, keys) => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every(k => keys.includes(k));
const defaults = Object.freeze({
  maxEntries: 128, maxBytes: 2 * 1024 * 1024, maxEntryBytes: 64 * 1024,
  maxScopeEntries: 64, maxScopeBytes: 1024 * 1024,
  maxTickets: 128, maxResources: 4096, maxGrants: 256, maxProjects: 32,
  maxDependencies: 64, ttlMs: 300000, ticketTtlMs: 30000
});
const maxima = Object.freeze({
  maxEntries:4096, maxBytes:64*1024*1024, maxEntryBytes:1024*1024,
  maxScopeEntries:4096, maxScopeBytes:64*1024*1024,
  maxTickets:1024, maxResources:65536, maxGrants:4096, maxProjects:256,
  maxDependencies:256, ttlMs:3600000, ticketTtlMs:300000
});

/**
 * Experimento de reuso em UM isolate Node. Não é autenticação, armazenamento durável,
 * watcher de filesystem, cache KV, executor de ações ou prova de completude das dependências.
 * Somente o host confiável pode alterar recursos/grants; consumidores usam tickets opacos.
 */
export class WitnessCache {
  #limits; #clock; #last=-Infinity; #fault=false;
  #projects=new Set(); #resources=new Map(); #grants=new Map();
  #entries=new Map(); #reverse=new Map(); #scopes=new Map(); #tickets=new Map(); #bytes=0;
  #counts={hits:0,misses:0,invalidated:0,evicted:0,expired:0,committed:0,rejected:0};
  constructor({clock=()=>performance.now(),...limits}={}) {
    check(typeof clock==='function','INVALID_CLOCK');
    check(Object.keys(limits).every(k=>Object.hasOwn(defaults,k)),'UNKNOWN_LIMIT');
    this.#limits=Object.freeze({...defaults,...limits}); this.#clock=clock;
    for(const [k,v] of Object.entries(this.#limits))check(Number.isSafeInteger(v)&&v>0&&v<=maxima[k],'INVALID_LIMIT');
    check(this.#limits.maxScopeBytes<=this.#limits.maxBytes&&this.#limits.maxScopeEntries<=this.#limits.maxEntries,'INVALID_SCOPE_LIMIT');
  }
  #now(){
    check(!this.#fault,'CLOCK_FAULT'); const now=this.#clock();
    if(!Number.isFinite(now)||now<0||now<this.#last||now>Number.MAX_SAFE_INTEGER-this.#limits.ttlMs-this.#limits.ticketTtlMs){
      this.#fault=true;this.#clear();throw new CacheError('CLOCK_FAULT');
    }
    this.#last=now;return now;
  }
  #clear(){this.#entries.clear();this.#reverse.clear();this.#scopes.clear();this.#tickets.clear();this.#bytes=0;}
  #project(project){check(id(project),'INVALID_PROJECT');if(!this.#projects.has(project)){check(this.#projects.size<this.#limits.maxProjects,'PROJECT_LIMIT');this.#projects.add(project);}}
  #drop(key, reason){
    const e=this.#entries.get(key); if(!e)return;
    this.#entries.delete(key);this.#bytes-=e.bytes;
    const s=this.#scopes.get(e.scope);s.keys.delete(key);s.bytes-=e.bytes;if(!s.keys.size)this.#scopes.delete(e.scope);
    for(const d of e.dependencies){const set=this.#reverse.get(d.key);set?.delete(key);if(set?.size===0)this.#reverse.delete(d.key);}
    if(reason)this.#counts[reason]++;
  }
  #prune(now){
    for(const [token,t] of this.#tickets)if(now>=t.expiresAt)this.#tickets.delete(token);
    for(const [key,e] of this.#entries)if(now>=e.expiresAt)this.#drop(key,'expired');
  }
  /** CAS de um lote host-owned. Valida tudo antes de modificar versões. Hash igual é early cutoff. */
  updateResources(project, updates){
    this.#now();check(id(project),'INVALID_PROJECT');
    check(Array.isArray(updates)&&updates.length>0&&updates.length<=this.#limits.maxDependencies,'INVALID_UPDATE_BATCH');
    const seen=new Set();let newResources=0;
    const prepared=updates.map(u=>{
      check(fields(u,['name','digest','expectedVersion'])&&id(u.name)&&natural(u.expectedVersion)&&(sha(u.digest)||u.digest===null),'INVALID_RESOURCE');
      const key=keyOf(project,u.name);check(!seen.has(key),'DUPLICATE_RESOURCE');seen.add(key);
      const old=this.#resources.get(key);check((old?.version??0)===u.expectedVersion,'RESOURCE_CONFLICT');
      if(!old)newResources++;
      const changed=!old||old.digest!==u.digest;
      check(!changed||(old?.version??0)<Number.MAX_SAFE_INTEGER,'VERSION_OVERFLOW');
      return {key,name:u.name,digest:u.digest,version:changed?(old?.version??0)+1:old.version,changed};
    });
    check(this.#resources.size+newResources<=this.#limits.maxResources,'RESOURCE_LIMIT');
    this.#project(project);
    for(const p of prepared){
      if(!p.changed)continue;
      this.#resources.set(p.key,{version:p.version,digest:p.digest});
      for(const key of [...(this.#reverse.get(p.key)??[])])this.#drop(key,'invalidated');
    }
    return prepared.map(({name,version,changed})=>({name,version,changed}));
  }
  /** Revogar invalida entradas do principal. Reaprovação usa nova revisão; não ressuscita tickets antigos. */
  setGrant(project, principal, allowed, expectedVersion){
    this.#now();check(id(project)&&id(principal)&&typeof allowed==='boolean'&&natural(expectedVersion),'INVALID_GRANT');
    const key=keyOf(project,principal),old=this.#grants.get(key);
    check((old?.version??0)===expectedVersion,'GRANT_CONFLICT');
    check(expectedVersion<Number.MAX_SAFE_INTEGER,'VERSION_OVERFLOW');
    check(old||this.#grants.size<this.#limits.maxGrants,'GRANT_LIMIT');this.#project(project);
    const grant={version:expectedVersion+1,allowed};this.#grants.set(key,grant);
    for(const cached of [...(this.#scopes.get(key)?.keys??[])])this.#drop(cached,'invalidated');
    return grant.version;
  }
  #dependencies(project, kind, names){
    check(['artifact','search','context','decision'].includes(kind),'NON_REUSABLE_OPERATION');
    check(Array.isArray(names)&&names.length>0&&names.length<=this.#limits.maxDependencies&&names.every(id),'INVALID_DEPENDENCIES');
    check(new Set(names).size===names.length,'DUPLICATE_DEPENDENCY');
    const required=['policy/context'];
    if(kind==='search'||kind==='context')required.push('index/generation');
    if(kind==='context')required.push('memory/revision');
    if(kind==='decision')required.push('model/revision','calibration/revision');
    check(required.every(n=>names.includes(n)),'MISSING_REQUIRED_DEPENDENCY');
    if(kind==='artifact')check(names.some(n=>n.startsWith('content/')),'MISSING_CONTENT_DEPENDENCY');
    if(kind==='context')check(names.some(n=>n.startsWith('task/')),'MISSING_TASK_DEPENDENCY');
    if(kind==='decision')check(names.some(n=>n.startsWith('state/')),'MISSING_STATE_DEPENDENCY');
    return [...names].sort().map(name=>{const key=keyOf(project,name),r=this.#resources.get(key);check(r&&r.digest!==null,'DEPENDENCY_UNAVAILABLE');return {key,version:r.version,digest:r.digest};});
  }
  begin(request){
    const now=this.#now();this.#prune(now);
    check(fields(request,['project','principal','kind','queryHash','contractHash','dependencies']),'INVALID_REQUEST');
    const {project,principal,kind,queryHash,contractHash}=request;
    check(id(project)&&id(principal)&&sha(queryHash)&&sha(contractHash),'INVALID_IDENTITY');
    const scope=keyOf(project,principal),grant=this.#grants.get(scope);check(grant?.allowed===true,'NOT_AUTHORIZED');
    const dependencies=this.#dependencies(project,kind,request.dependencies);
    check(this.#tickets.size<this.#limits.maxTickets,'TICKET_LIMIT');
    const identity=keyOf(VERSION,scope,grant.version,kind,queryHash,contractHash,dependencies);
    const token=Object.freeze(Object.create(null));
    this.#tickets.set(token,{key:digest(identity),scope,grantVersion:grant.version,dependencies,metadataBytes:Buffer.byteLength(identity),expiresAt:now+this.#limits.ticketTtlMs});
    return token;
  }
  #ticket(token,now){
    const t=this.#tickets.get(token);check(t,'UNKNOWN_TICKET');
    const reject=code=>{this.#tickets.delete(token);this.#counts.rejected++;throw new CacheError(code);};
    if(now>=t.expiresAt)return reject('TICKET_EXPIRED');
    const g=this.#grants.get(t.scope);
    if(!g?.allowed||g.version!==t.grantVersion)return reject('AUTHORIZATION_CHANGED');
    for(const d of t.dependencies){const r=this.#resources.get(d.key);if(!r||r.digest===null||r.version!==d.version||r.digest!==d.digest)return reject('DEPENDENCY_CHANGED');}
    return t;
  }
  /** Hit consome o ticket; miss o mantém para commit. Resultado é cópia desconectada. */
  lookup(token){
    const now=this.#now(),t=this.#ticket(token,now),e=this.#entries.get(t.key);
    if(!e||now>=e.expiresAt){if(e)this.#drop(t.key,'expired');this.#counts.misses++;return null;}
    this.#entries.delete(t.key);this.#entries.set(t.key,e);
    const s=this.#scopes.get(e.scope);s.keys.delete(t.key);s.keys.add(t.key);
    this.#tickets.delete(token);this.#counts.hits++;
    return Buffer.from(e.payload);
  }
  /** Checar ticket e dependências novamente DEPOIS da computação; sem await na publicação. */
  commit(token,payload){
    const now=this.#now(),t=this.#ticket(token,now);this.#tickets.delete(token);
    check(typeof payload==='string'||Buffer.isBuffer(payload),'INVALID_PAYLOAD');
    const size=Buffer.isBuffer(payload)?payload.length:Buffer.byteLength(payload);
    const bytes=size+t.metadataBytes+64;
    check(size<=this.#limits.maxEntryBytes&&bytes<=this.#limits.maxScopeBytes&&bytes<=this.#limits.maxBytes,'ENTRY_TOO_LARGE');
    const copy=Buffer.from(payload);this.#prune(now);
    const previous=this.#entries.get(t.key);
    if(previous){
      if(!previous.payload.equals(copy)){this.#drop(t.key,'invalidated');throw new CacheError('INCONSISTENT_RESULT');}
      return {stored:false,duplicate:true};
    }
    let scope=this.#scopes.get(t.scope);
    while(scope&&(scope.keys.size>=this.#limits.maxScopeEntries||scope.bytes+bytes>this.#limits.maxScopeBytes)){
      this.#drop(scope.keys.values().next().value,'evicted');scope=this.#scopes.get(t.scope);
    }
    while(this.#entries.size>=this.#limits.maxEntries||this.#bytes+bytes>this.#limits.maxBytes)this.#drop(this.#entries.keys().next().value,'evicted');
    scope=this.#scopes.get(t.scope);if(!scope){scope={keys:new Set(),bytes:0};this.#scopes.set(t.scope,scope);}
    const e={scope:t.scope,payload:copy,dependencies:t.dependencies,bytes,expiresAt:now+this.#limits.ttlMs};
    this.#entries.set(t.key,e);scope.keys.add(t.key);scope.bytes+=bytes;this.#bytes+=bytes;
    for(const d of t.dependencies){let set=this.#reverse.get(d.key);if(!set){set=new Set();this.#reverse.set(d.key,set);}set.add(t.key);}
    this.#counts.committed++;return {stored:true,duplicate:false};
  }
  cancel(token){return this.#tickets.delete(token);}
  stats(){return {...this.#counts,entries:this.#entries.size,accountedBytes:this.#bytes,tickets:this.#tickets.size,resources:this.#resources.size,grants:this.#grants.size,reverseEdges:[...this.#reverse.values()].reduce((n,s)=>n+s.size,0),scope:'one-node-isolate',hardRssLimit:false,persistent:false};}
  clear(){this.#clear();}
}

