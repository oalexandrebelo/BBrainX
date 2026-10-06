import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setImmediate as yieldTurn } from 'node:timers/promises';

export const REPLAY_LIMITS = Object.freeze({ nodes: 10000, steps: 20000, bytes: 8 * 1024 * 1024 });
export const REPLAY_STRATEGIES = Object.freeze(['round-robin','depth-first','best-observed']);
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const integer = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const text = x => typeof x === 'string' && x.length > 0 && x.length <= 160 && !/[\x00-\x1f]/.test(x);
function requireThat(ok, code) { if (!ok) throw new Error(code); }
const only = (value, names) => Object.keys(value).every(key => names.includes(key));
/** Árvore histórica de raiz e cadeias. Não prediz ações novas, não executa políticas vindas do arquivo. */
export function validateWorld(value) {
  requireThat(obj(value) && value.schemaVersion === 1 && only(value,['schemaVersion','worldId','project','snapshot','evaluatorVersion','verifierSha256','costUnit','origin','nodes']), 'INVALID_WORLD_SCHEMA');
  requireThat(text(value.worldId) && text(value.project) && text(value.evaluatorVersion) && text(value.costUnit), 'INVALID_WORLD_IDENTITY');
  requireThat(/^[a-f0-9]{64}$/.test(value.snapshot ?? '') && /^[a-f0-9]{64}$/.test(value.verifierSha256 ?? ''), 'MISSING_WORLD_PROVENANCE');
  requireThat(['recorded','fixture'].includes(value.origin), 'INVALID_WORLD_ORIGIN');
  requireThat(Array.isArray(value.nodes) && value.nodes.length > 0 && value.nodes.length <= REPLAY_LIMITS.nodes, 'INVALID_WORLD_SIZE');
  const index = new Map(), childCount = new Map(); let previousOrdinal = -1;
  const nodes = value.nodes.map((n, i) => {
    requireThat(obj(n) && only(n,['id','parent','ordinal','score','accepted','cost']), 'INVALID_NODE_FIELDS');
    requireThat(text(n.id) && !index.has(n.id) && integer(n.ordinal,1e9) && n.ordinal > previousOrdinal, 'INVALID_NODE_IDENTITY');
    requireThat(Number.isFinite(n.score) && n.score >= 0 && n.score <= 1 && typeof n.accepted === 'boolean', 'INVALID_VERIFIER_RESULT');
    requireThat(integer(n.cost,1e9) && (i === 0 ? n.cost === 0 : n.cost > 0), 'INVALID_NODE_COST');
    requireThat(i === 0 ? n.parent === null : text(n.parent) && index.has(n.parent), 'INVALID_PARENT_ORDER');
    if (i > 0) {
      childCount.set(n.parent,(childCount.get(n.parent) ?? 0)+1);
      requireThat(n.parent === value.nodes[0].id || childCount.get(n.parent) === 1,'NON_ROOT_MUST_BE_RECORDED_CHAIN');
    }
    const node = Object.freeze({id:n.id,parent:n.parent,ordinal:n.ordinal,score:n.score,accepted:n.accepted,cost:n.cost});
    index.set(n.id,node); previousOrdinal=n.ordinal; return node;
  });
  return Object.freeze({schemaVersion:1,worldId:value.worldId,project:value.project,snapshot:value.snapshot,
    evaluatorVersion:value.evaluatorVersion,verifierSha256:value.verifierSha256,costUnit:value.costUnit,origin:value.origin,nodes:Object.freeze(nodes)});
}

/** Somente nós revelados entram aqui. Deque O(1); heap O(log F), sem copiar a fronteira inteira por decisão. */
class Frontier {
  #head=null; #tail=null; #heap=[]; #size=0; #order=0;
  constructor(strategy){this.strategy=strategy;}
  get size(){return this.#size;}
  #better(a,b){return a.node.score>b.node.score || (a.node.score===b.node.score && a.order<b.order);}
  push(node){
    const entry={node,order:this.#order++,next:null,prev:null}; this.#size++;
    if(this.strategy==='best-observed'){
      let i=this.#heap.length;this.#heap.push(entry);
      while(i>0){const p=(i-1)>>1;if(!this.#better(entry,this.#heap[p]))break;this.#heap[i]=this.#heap[p];i=p;}
      this.#heap[i]=entry;return;
    }
    entry.prev=this.#tail;if(this.#tail)this.#tail.next=entry;else this.#head=entry;this.#tail=entry;
  }
  take(){
    if(!this.#size)return null;this.#size--;
    if(this.strategy==='best-observed'){
      const best=this.#heap[0],last=this.#heap.pop();
      if(this.#heap.length){let i=0;while(true){let j=2*i+1;if(j>=this.#heap.length)break;if(j+1<this.#heap.length&&this.#better(this.#heap[j+1],this.#heap[j]))j++;if(!this.#better(this.#heap[j],last))break;this.#heap[i]=this.#heap[j];i=j;}this.#heap[i]=last;}
      return best.node;
    }
    const entry=this.strategy==='depth-first'?this.#tail:this.#head;
    if(entry.prev)entry.prev.next=entry.next;else this.#head=entry.next;
    if(entry.next)entry.next.prev=entry.prev;else this.#tail=entry.prev;
    return entry.node;
  }
}

/** Replay serial, limitado e cooperativo. Não é implementação integral de Dream-RSI ou estimador causal. */
export async function replayWorld(input,{strategy='round-robin',maxSteps=1000,maxCost=1000000,stopOnAccepted=true,signal}={}){
  requireThat(REPLAY_STRATEGIES.includes(strategy),'UNKNOWN_REPLAY_STRATEGY');
  requireThat(integer(maxSteps,REPLAY_LIMITS.steps)&&maxSteps>0&&integer(maxCost,1e12)&&maxCost>0&&typeof stopOnAccepted==='boolean','INVALID_REPLAY_BUDGET');
  requireThat(signal===undefined||signal instanceof AbortSignal,'INVALID_ABORT_SIGNAL');
  const begin=performance.now(),cpuBegin=process.cpuUsage();
  const world=validateWorld(input),root=world.nodes[0],children=new Map();
  // validateWorld impõe ordem causal crescente. Não há sort nem inspeção de score para construir as arestas.
  for(let i=1;i<world.nodes.length;i++){const n=world.nodes[i];if(!children.has(n.parent))children.set(n.parent,[]);children.get(n.parent).push(n);}
  const frontier=new Frontier(strategy),actions=[];
  let rootCursor=0,rootAllowed=true,spent=0,best=root.score,accepted=root.accepted,observed=0,supportMisses=0,reason='STEP_LIMIT';
  for(let round=0;round<maxSteps;round++){
    if(signal?.aborted){reason='CANCELLED';break;}
    if(stopOnAccepted&&accepted){reason='ACCEPTED_RECORDED_RESULT';break;}
    if(observed===world.nodes.length-1){reason='RECORDED_TREE_EXHAUSTED';break;}
    const openRoot=rootAllowed&&(!frontier.size||(strategy==='round-robin'&&round%2===0)||(strategy==='best-observed'&&round%3===0));
    const parent=openRoot?root:frontier.take();
    if(!parent){reason='NO_RECORDED_CONTINUATION';break;}
    const next=children.get(parent.id)?.[parent===root?rootCursor:0];
    if(!next){
      if(parent===root)rootAllowed=false;
      supportMisses++;actions.push({parent:parent.id,result:'UNSUPPORTED_BY_HISTORY'});
    }else if(next.cost>maxCost-spent){reason='RECORDED_COST_BUDGET';break;}
    else{
      if(parent===root)rootCursor++;
      frontier.push(next);observed++;spent+=next.cost;best=Math.max(best,next.score);accepted ||= next.accepted;
      actions.push({parent:parent.id,revealed:next.id,score:next.score,accepted:next.accepted,cost:next.cost});
    }
    if(round%32===31)await yieldTurn();
  }
  if(reason==='STEP_LIMIT'){
    if(signal?.aborted)reason='CANCELLED';
    else if(stopOnAccepted&&accepted)reason='ACCEPTED_RECORDED_RESULT';
    else if(observed===world.nodes.length-1)reason='RECORDED_TREE_EXHAUSTED';
  }
  const cpu=process.cpuUsage(cpuBegin);
  return {schemaVersion:1,kind:'recorded-tree-policy-replay',worldId:world.worldId,project:world.project,
    snapshot:world.snapshot,evaluatorVersion:world.evaluatorVersion,verifierSha256:world.verifierSha256,
    worldSha256:createHash('sha256').update(JSON.stringify(world)).digest('hex'),origin:world.origin,strategy,
    bestRecordedScore:best,acceptedRecordedResult:accepted,representedCost:spent,costUnit:world.costUnit,
    observedNodes:observed,totalRecordedNodes:world.nodes.length-1,supportMisses,
    coverage:world.nodes.length===1?1:observed/(world.nodes.length-1),reason,actions,
    replayWallMs:performance.now()-begin,replayProcessCpuMs:(cpu.user+cpu.system)/1000,
    providerCalls:0,weightsChanged:false,policyPromoted:false,globalAccuracy:null,billingSavings:null,
    limit:'Só resultados gravados. Não estima ramos inéditos, latência contrafactual, qualidade de outro modelo ou custo faturado. Hash não autentica histórico.'};
}
