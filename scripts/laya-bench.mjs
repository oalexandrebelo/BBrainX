import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { BrainStore } from '../src/store.mjs';
import { search } from '../src/retrieval.mjs';
import { queryTerms } from '../src/analyze.mjs';
import { LayaBroker, layaStatus } from '../src/laya.mjs';

// uso: node scripts/laya-bench.mjs [--project <id> --cases <consultas.cases>] [--memory <pares.cases>] [--candidates 10] [--out <relatorio.json>]
// Mede, na máquina atual, se o Laya melhora duas decisões contra o caminho determinístico. Exige `bbrainx laya install`.
const {values}=parseArgs({options:{project:{type:'string'},cases:{type:'string'},memory:{type:'string'},candidates:{type:'string'},out:{type:'string'}}});
const status=layaStatus();
if(!status.runtime||!status.weights){console.error('Perfil Laya não instalado. Execute: node bin/bbrainx.mjs laya install');process.exit(2);}
const broker=new LayaBroker({deadlineMs:120000}), percentile=(values,q)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))]:null;};
const report={kind:'laya-decision-bench',observedAt:new Date().toISOString(),platform:process.platform+' '+process.arch,profile:status.package+' · '+status.checkpoint};

function rankSummary(ranks){const hit=k=>ranks.filter(rank=>rank!==null&&rank<=k).length/ranks.length;return {mrr:+(ranks.reduce((sum,rank)=>sum+(rank?1/rank:0),0)/ranks.length).toFixed(3),hit1:+hit(1).toFixed(3),hit3:+hit(3).toFixed(3),hit10:+hit(10).toFixed(3)};}
async function retrieval(){
  const cases=JSON.parse(fs.readFileSync(values.cases,'utf8')), candidates=Number(values.candidates||10), store=new BrainStore();
  const ranks={lexical:[],noul:[],score:[],fusedNoul:[],fusedScore:[]}, times=[];let truncated=0,rows=0;
  try{
    for(const item of cases){
      const items=search(store,values.project,item.query,50).items, position=list=>{const at=list.findIndex(x=>item.expect.includes(x.path));return at<0?null:at+1;};
      ranks.lexical.push(position(items));
      const head=items.slice(0,candidates), tail=items.slice(candidates);
      if(!head.length){for(const name of ['noul','score','fusedNoul','fusedScore'])ranks[name].push(null);continue;}
      // O trecho recuperado vai só no estado; a pergunta carrega a consulta de quem pediu.
      const questions={
        yes:{type:'noul',instructions:'Does this file excerpt contain the code or text that answers: "'+item.query+'"?',criteria:{true:'the excerpt implements or explains exactly this',false:'the excerpt is about something else or only mentions it'}},
        fit:{type:'score',instructions:'How well does this file excerpt answer: "'+item.query+'"?',criteria:['unrelated','mentions it in passing','implements or explains exactly this']}
      };
      const reply=await broker.decide(head.map(x=>'File: '+x.path+'\n'+x.body),questions,{maxLen:1024});
      if(!reply.ok)throw new Error('Laya não respondeu: '+reply.reason);
      times.push(reply.ms);rows+=head.length;truncated+=reply.results.filter(x=>x.truncated).length;
      const scored=head.map((x,index)=>({x,index,noul:reply.results[index].answers.yes.noul,score:reply.results[index].answers.fit.score}));
      const order=key=>[...scored].sort((a,b)=>b[key]-a[key]||a.index-b.index);
      const fused=key=>{const place=new Map(order(key).map((entry,at)=>[entry.index,at]));return [...scored].sort((a,b)=>(1/(60+place.get(b.index))+1/(60+b.index))-(1/(60+place.get(a.index))+1/(60+a.index))||a.index-b.index);};
      const full=list=>position([...list.map(entry=>entry.x),...tail]);
      ranks.noul.push(full(order('noul')));ranks.score.push(full(order('score')));ranks.fusedNoul.push(full(fused('noul')));ranks.fusedScore.push(full(fused('score')));
    }
  }finally{store.close();}
  return {cases:cases.length,candidates,methods:Object.fromEntries(Object.entries(ranks).map(([name,list])=>[name,rankSummary(list)])),truncatedShare:+(truncated/rows).toFixed(3),msPerQueryP50:percentile(times,.5),msPerQueryP95:percentile(times,.95)};
}

function classification(pairs,predict){
  let tp=0,fp=0,fn=0,tn=0;
  for(const pair of pairs){const guess=predict(pair);if(guess&&pair.label)tp++;else if(guess&&!pair.label)fp++;else if(!guess&&pair.label)fn++;else tn++;}
  const precision=tp+fp?tp/(tp+fp):null, recall=tp/(tp+fn);
  return {accuracy:+((tp+tn)/pairs.length).toFixed(3),precision:precision===null?null:+precision.toFixed(3),recall:+recall.toFixed(3),f1:precision===null||precision+recall===0?0:+(2*precision*recall/(precision+recall)).toFixed(3),tp,fp,fn,tn};
}
async function memory(){
  const data=JSON.parse(fs.readFileSync(values.memory,'utf8')), pairs=[];
  for(const item of data.cases){for(const id of item.relevant)pairs.push({objective:item.objective,memory:data.memories[id],label:true});for(const id of item.unrelated)pairs.push({objective:item.objective,memory:data.memories[id],label:false});}
  const questions={
    applies:{type:'noul',instructions:'Would a developer need to follow this note while doing this task?',criteria:{true:'the note constrains or guides how this task must be done',false:'the note is about a different subject and does not affect this task'}},
    pick:{type:'choice',instructions:'Is the note relevant to the task?',criteria:{A:'the note must be followed while doing this task',B:'the note is about a different subject'}}
  };
  const times=[];
  for(let at=0;at<pairs.length;at+=16){
    const slice=pairs.slice(at,at+16), reply=await broker.decide(slice.map(pair=>'Task: '+pair.objective+'\nNote: '+pair.memory),questions,{maxLen:1024});
    if(!reply.ok)throw new Error('Laya não respondeu: '+reply.reason);
    times.push(reply.ms/slice.length);
    slice.forEach((pair,index)=>{const answers=reply.results[index].answers;pair.noul=answers.applies.noul;pair.noulConfidence=answers.applies.answer_confidence;pair.choice=answers.pick.choice;pair.choiceConfidence=answers.pick.answer_confidence;});
  }
  const lexical=pair=>{const terms=queryTerms(pair.objective);for(const term of queryTerms(pair.memory))if(terms.has(term))return true;return false;};
  // Acerto seletivo: só as decisões acima do limiar contam; o resto volta para o caminho determinístico.
  const selective=[.6,.7,.8,.9,.95].map(threshold=>{const kept=pairs.filter(pair=>pair.noulConfidence>=threshold);return {threshold,coverage:+(kept.length/pairs.length).toFixed(3),accuracy:kept.length?+(kept.filter(pair=>(pair.noul>=.5)===pair.label).length/kept.length).toFixed(3):null};});
  const positives=pairs.filter(pair=>pair.label).length;
  return {pairs:pairs.length,positives,majorityAccuracy:+(Math.max(positives,pairs.length-positives)/pairs.length).toFixed(3),lexical:classification(pairs,lexical),layaNoul:classification(pairs,pair=>pair.noul>=.5),layaChoice:classification(pairs,pair=>pair.choice==='A'),layaNoulSelective:selective,msPerPairP50:+percentile(times,.5).toFixed(1)};
}

try{
  if(values.project&&values.cases)report.retrieval=await retrieval();
  if(values.memory)report.memory=await memory();
  report.runtime=broker.info;
  report.caveats=['Amostra pequena e rotulada à mão: sem alegação estatística.','Mede a decisão isolada, não tarefa aceita.','As formulações das perguntas foram fixadas antes de olhar o resultado.'];
  if(values.out)fs.writeFileSync(values.out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{broker.stop();}
