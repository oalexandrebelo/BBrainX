import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWorld,replayWorld,REPLAY_STRATEGIES} from '../src/replay.mjs';
const node=(id,parent,ordinal,score=0,accepted=false,cost=1)=>({id,parent,ordinal,score,accepted,cost});
const world=(nodes)=>({schemaVersion:1,worldId:'fixture',project:'test-project',snapshot:'a'.repeat(64),evaluatorVersion:'evaluator-1',verifierSha256:'b'.repeat(64),costUnit:'recorded-attempts',origin:'fixture',nodes:nodes??[node('root',null,0,0,false,0),node('a','root',1,0.2),node('a1','a',2,0.8),node('b','root',3,0.1),node('b1','b',4,1,true)]});
test('mundo tem proveniência e é copiado imutavelmente',()=>{const input=world(),w=validateWorld(input);input.nodes[0].score=1;assert.equal(w.nodes[0].score,0);assert(Object.isFrozen(w.nodes));assert(Object.isFrozen(w.nodes[0]));});
test('esquema recusa ciclos, órfãos, ids e ordinais duplicados',()=>{
 for(const nodes of [[node('root',null,0,0,false,0),node('a','a',1)],[node('root',null,0,0,false,0),node('a','missing',1)],[node('root',null,0,0,false,0),node('root','root',1)],[node('root',null,0,0,false,0),node('a','root',0)]])assert.throws(()=>validateWorld(world(nodes)));
});
test('somente raiz pode iniciar múltiplos ramos registrados',()=>{assert.throws(()=>validateWorld(world([node('r',null,0,0,false,0),node('a','r',1),node('b','a',2),node('c','a',3)])),/NON_ROOT_MUST_BE_RECORDED_CHAIN/);});
test('rejeita números não finitos, custos negativos, metadados e código no mundo',()=>{
 assert.throws(()=>validateWorld({...world(),run:'shell command'}));assert.throws(()=>validateWorld({...world(),snapshot:null}));
 for(const score of [NaN,Infinity,-1,1.01]){const w=world();w.nodes[1].score=score;assert.throws(()=>validateWorld(w));}
 for(const cost of [-1,0,1.5]){const w=world();w.nodes[1].cost=cost;assert.throws(()=>validateWorld(w));}
});
test('estratégias percorrem somente resultados gravados sem provider',async()=>{
 for(const strategy of REPLAY_STRATEGIES){const r=await replayWorld(world(),{strategy,maxSteps:100});assert.equal(r.acceptedRecordedResult,true);assert.equal(r.providerCalls,0);assert.equal(r.weightsChanged,false);assert.equal(r.policyPromoted,false);assert.equal(r.billingSavings,null);assert(r.actions.every(a=>a.result==='UNSUPPORTED_BY_HISTORY'||world().nodes.some(n=>n.id===a.revealed)));}
});
test('mudar score oculto não altera a primeira escolha',async()=>{
 const a=world(),b=world();b.nodes[3].score=1;b.nodes[4].score=0;
 for(const strategy of REPLAY_STRATEGIES){const x=await replayWorld(a,{strategy,maxSteps:1}),y=await replayWorld(b,{strategy,maxSteps:1});assert.deepEqual(x.actions,y.actions);assert.equal(x.actions[0].revealed,'a');}
});
test('não usa custo oculto para escolher outro ramo barato',async()=>{
 const w=world();w.nodes[1].cost=100;w.nodes[3].cost=1;const r=await replayWorld(w,{maxCost:2});assert.equal(r.reason,'RECORDED_COST_BUDGET');assert.equal(r.observedNodes,0);assert.equal(r.representedCost,0);
});
test('custos são inteiros e não excedem orçamento',async()=>{for(let maxCost=1;maxCost<=4;maxCost++){const r=await replayWorld(world(),{maxCost});assert(r.representedCost<=maxCost);assert.equal(r.representedCost,r.actions.reduce((s,a)=>s+(a.cost??0),0));}});
test('máximo de passos é respeitado',async()=>{for(let maxSteps=1;maxSteps<=5;maxSteps++){const r=await replayWorld(world(),{maxSteps});assert(r.actions.length<=maxSteps);}});
test('resultado aceito e score são conceitos independentes',async()=>{const w=world([node('r',null,0,1,false,0)]);const r=await replayWorld(w);assert.equal(r.acceptedRecordedResult,false);assert.equal(r.bestRecordedScore,1);assert.equal(r.coverage,1);});
test('aceitação na última ação não vira falso step limit',async()=>{const w=world([node('r',null,0,0,false,0),node('a','r',1,1,true)]);assert.equal((await replayWorld(w,{maxSteps:1})).reason,'ACCEPTED_RECORDED_RESULT');});
test('cancelamento antes de iniciar não revela nós',async()=>{const c=new AbortController();c.abort();const r=await replayWorld(world(),{signal:c.signal});assert.equal(r.reason,'CANCELLED');assert.equal(r.observedNodes,0);});
test('cancelamento cooperativo executa entre fatias, não promete preempção',async()=>{const nodes=[node('r',null,0,0,false,0)];for(let i=1;i<5000;i++)nodes.push(node('n'+i,i===1?'r':'n'+(i-1),i));const c=new AbortController();setImmediate(()=>c.abort());const r=await replayWorld(world(nodes),{strategy:'depth-first',signal:c.signal,maxSteps:10000});assert.equal(r.reason,'CANCELLED');assert(r.observedNodes>0&&r.observedNodes<4999);});
test('replay é determinístico fora das métricas da execução',async()=>{const a=await replayWorld(world()),b=await replayWorld(world());assert.deepEqual(a.actions,b.actions);assert.equal(a.worldSha256,b.worldSha256);});
test('árvore termina sem loop quando não há suporte registrado',async()=>{const r=await replayWorld(world([node('r',null,0,0,false,0),node('a','r',1)]),{stopOnAccepted:false});assert.equal(r.reason,'RECORDED_TREE_EXHAUSTED');assert.equal(r.coverage,1);});
test('máximo de nós é uma restrição de admissão real',()=>{const nodes=[node('r',null,0,0,false,0)];for(let i=1;i<=10000;i++)nodes.push(node('n'+i,'r',i));assert.throws(()=>validateWorld(world(nodes)),/INVALID_WORLD_SIZE/);});
test('configuração inválida nunca executa política de arquivo',async()=>{for(const options of [{strategy:'eval'},{maxSteps:0},{maxSteps:20001},{maxCost:Infinity},{signal:{aborted:false}}])await assert.rejects(replayWorld(world(),options));});
