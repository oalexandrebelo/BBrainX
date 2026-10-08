import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {BrainStore} from '../src/store.mjs';
import {search} from '../src/retrieval.mjs';
import {queryTerms} from '../src/analyze.mjs';
import {gitState} from '../src/host.mjs';
import {LAYA,LayaBroker,layaStatus} from '../src/laya.mjs';

// Uso: node scripts/laya-bench.mjs (--cases <arquivo> --project <id> | --memory <arquivo>) [--max-len 1024] [--batch-size 4] [--timeout-ms 120000] [--out <json>]
const optionShape={project:{type:'string'},cases:{type:'string'},memory:{type:'string'},candidates:{type:'string'},'max-len':{type:'string'},'batch-size':{type:'string'},'timeout-ms':{type:'string'},out:{type:'string'}};
const integerOption=(value,fallback,min,max,name)=>{
  if(value===undefined)return fallback;
  const number=Number(value);
  if(!Number.isSafeInteger(number)||number<min||number>max){const error=new Error(`--${name} precisa ser inteiro entre ${min} e ${max}.`);error.code='LAYA_BENCH_OPTION_INVALID';throw error;}
  return number;
};
export function parseBenchArgs(argv){
  let values;
  try{values=parseArgs({args:argv,options:optionShape,strict:true,allowPositionals:false}).values;}
  catch(error){error.code='LAYA_BENCH_OPTION_INVALID';throw error;}
  const args={project:values.project,cases:values.cases,memory:values.memory,candidates:integerOption(values.candidates,10,1,50,'candidates'),maxLen:integerOption(values['max-len'],1024,256,8192,'max-len'),batchSize:integerOption(values['batch-size'],4,1,64,'batch-size'),timeoutMs:integerOption(values['timeout-ms'],120000,1000,600000,'timeout-ms'),out:values.out};
  if(!args.cases&&!args.memory){const error=new Error('Informe --cases, --memory ou ambos.');error.code='LAYA_BENCH_INPUT_REQUIRED';throw error;}
  if(args.cases&&!args.project){const error=new Error('--cases exige --project.');error.code='LAYA_BENCH_PROJECT_REQUIRED';throw error;}
  return args;
}

const percentile=(values,q)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))]:null;};
const sha256=value=>createHash('sha256').update(value).digest('hex');
const rankSummary=ranks=>{
  const known=ranks.filter(rank=>rank!==null),hit=k=>known.filter(rank=>rank<=k).length/ranks.length;
  return {mrr:ranks.length?+(ranks.reduce((sum,rank)=>sum+(rank?1/rank:0),0)/ranks.length).toFixed(3):null,hit1:ranks.length?+hit(1).toFixed(3):null,hit3:ranks.length?+hit(3).toFixed(3):null,hit10:ranks.length?+hit(10).toFixed(3):null};
};
const firstRelevantRank=(list,expected)=>{const index=list.findIndex(entry=>expected.includes(entry.path));return index<0?null:index+1;};

/** Deterministic ranking logic, including the historical zero-based RRF fusion (k=60). */
export function rankCandidateMethods(head,tail,answers,usage,expectedPaths){
  const scored=head.map((candidate,index)=>({candidate,index,noul:answers[index]?.noul?.noul,score:answers[index]?.score?.score}));
  const order=key=>[...scored].sort((a,b)=>{
    const av=a[key],bv=b[key],af=Number.isFinite(av),bf=Number.isFinite(bv);
    if(af&&bf)return bv-av||a.index-b.index;
    if(af!==bf)return af?-1:1;
    return a.index-b.index;
  });
  const fuse=key=>{const positions=new Map(order(key).map((entry,at)=>[entry.index,at]));return [...scored].sort((a,b)=>(1/(60+positions.get(b.index))+1/(60+b.index))-(1/(60+positions.get(a.index))+1/(60+a.index))||a.index-b.index);};
  const rank=entries=>firstRelevantRank([...entries.map(entry=>entry.candidate),...tail],expectedPaths);
  const lexical=firstRelevantRank([...head,...tail],expectedPaths);
  const nonFinite=scored.some(entry=>!Number.isFinite(entry.noul)||!Number.isFinite(entry.score));
  const headTruncated=usage.some(entry=>entry?.headTruncated===true);
  const truncated=usage.some(entry=>entry?.truncated===true);
  const fallback=headTruncated?'head_truncated':truncated?'truncated':nonFinite?'non_finite_score':null;
  return {ranks:{lexical,noul:rank(order('noul')),score:rank(order('score')),fusedNoul:rank(fuse('noul')),fusedScore:rank(fuse('score')),safeFallbackNoul:fallback?lexical:rank(order('noul')),safeFallbackScore:fallback?lexical:rank(order('score'))},safeFallbackReason:fallback};
}

function readDataset(file){
  const bytes=fs.readFileSync(file),data=JSON.parse(bytes.toString('utf8'));
  return {data,hash:sha256(bytes),name:path.basename(file)};
}
function hardware(){return {platform:os.platform(),release:os.release(),architecture:os.arch(),node:process.versions.node,memoryGiB:+(os.totalmem()/1073741824).toFixed(1),cpuCount:os.availableParallelism?.()??os.cpus().length};}
function classification(pairs,predict){
  let tp=0,fp=0,fn=0,tn=0;
  for(const pair of pairs){const guess=predict(pair);if(guess&&pair.label)tp++;else if(guess&&!pair.label)fp++;else if(!guess&&pair.label)fn++;else tn++;}
  const precision=tp+fp?tp/(tp+fp):null,recall=tp+fn?tp/(tp+fn):null;
  return {accuracy:pairs.length?+((tp+tn)/pairs.length).toFixed(3):null,precision:precision===null?null:+precision.toFixed(3),recall:recall===null?null:+recall.toFixed(3),f1:precision===null||recall===null||precision+recall===0?0:+(2*precision*recall/(precision+recall)).toFixed(3),tp,fp,fn,tn};
}
function datasetMetadata({name,hash}){return {name,sha256:hash};}
export function memoryPairEvidence(pair,index,result){
  const answers=result.answers;
  pair.noul=answers.applies.noul;pair.noulConfidence=answers.applies.answer_confidence;pair.choice=answers.pick.choice;pair.choiceConfidence=answers.pick.answer_confidence;pair.e2eMs=result.e2eMs;pair.workerMs=result.workerMs;
  return {pairIndex:index,label:pair.label,answers:{noul:answers.applies,choice:answers.pick},truncated:result.truncated,headTruncated:result.headTruncated,headWarnings:result.headWarnings,stateTokensDropped:result.stateTokensDropped,e2eMs:result.e2eMs,workerMs:result.workerMs};
}

async function runBatch(broker,states,questions,args,timings){
  const results=[];
  for(let at=0;at<states.length;at+=args.batchSize){
    const slice=states.slice(at,at+args.batchSize),start=performance.now();
    const reply=await broker.decide(slice,questions,{deadlineMs:args.timeoutMs,maxLen:args.maxLen});
    const e2eMs=+(performance.now()-start).toFixed(2);
    if(!reply.ok)throw Object.assign(new Error(`Laya não respondeu: ${reply.reason}`),{code:'LAYA_DECISION_FAILED'});
    const workerMs=reply.ms;
    timings.push({start:at,count:slice.length,e2eMs,workerMs});
    results.push(...reply.results.map(result=>({...result,e2eMs:+(e2eMs/slice.length).toFixed(2),workerMs:+(workerMs/slice.length).toFixed(2)})));
  }
  return results;
}

async function retrieval(broker,args,store,meta){
  const dataset=readDataset(args.cases),cases=dataset.data;
  if(!Array.isArray(cases)||cases.length===0)throw Object.assign(new Error('O dataset --cases precisa conter ao menos uma consulta.'),{code:'LAYA_BENCH_DATASET_INVALID'});
  const ranks={lexical:[],noul:[],score:[],fusedNoul:[],fusedScore:[],safeFallbackNoul:[],safeFallbackScore:[]},times=[],queryTimes=[],queryWorkerTimes=[],rows=[];
  let truncated=0,headTruncated=0,dropped=0,observed=0;
  for(let caseIndex=0;caseIndex<cases.length;caseIndex++){
    const item=cases[caseIndex];
    if(!item||typeof item.query!=='string'||!Array.isArray(item.expect))throw Object.assign(new Error(`Consulta ${caseIndex+1} inválida.`),{code:'LAYA_BENCH_DATASET_INVALID'});
    const items=search(store,args.project,item.query,50).items,head=items.slice(0,args.candidates),tail=items.slice(args.candidates);
    const questions={
      yes:{type:'noul',instructions:'Does this file excerpt contain the code or text that answers: "'+item.query+'"?',criteria:{true:'the excerpt implements or explains exactly this',false:'the excerpt is about something else or only mentions it'}},
      fit:{type:'score',instructions:'How well does this file excerpt answer: "'+item.query+'"?',criteria:['unrelated','mentions it in passing','implements or explains exactly this']}
    };
    let results=[];
    if(head.length){
      results=await runBatch(broker,head.map(entry=>'File: '+entry.path+'\n'+entry.body),questions,args,times);
      for(const result of results){observed++;truncated+=result.truncated?1:0;headTruncated+=result.headTruncated?1:0;dropped+=result.stateTokensDropped;}
    }
    queryTimes.push(results.reduce((sum,result)=>sum+result.e2eMs,0));
    queryWorkerTimes.push(results.reduce((sum,result)=>sum+result.workerMs,0));
    const answers=results.map(result=>({noul:result.answers.yes,score:result.answers.fit}));
    const usage=results.map(result=>({truncated:result.truncated,headTruncated:result.headTruncated,headWarnings:result.headWarnings,stateTokensDropped:result.stateTokensDropped}));
    const outcome=rankCandidateMethods(head,tail,answers,usage,item.expect);
    for(const [name,rank] of Object.entries(outcome.ranks))ranks[name].push(name==='lexical'&&!head.length?firstRelevantRank(items,item.expect):rank);
    const candidateRows=head.map((candidate,index)=>({candidateIndex:index,path:candidate.path,answers:answers[index],truncated:usage[index].truncated,headTruncated:usage[index].headTruncated,headWarnings:usage[index].headWarnings,stateTokensDropped:usage[index].stateTokensDropped,e2eMs:results[index].e2eMs,workerMs:results[index].workerMs}));
    rows.push({caseIndex,querySha256:sha256(item.query),expectedPathsSha256:sha256(JSON.stringify(item.expect)),ranks:outcome.ranks,safeFallbackReason:outcome.safeFallbackReason,headTruncated:results.some(result=>result.headTruncated),headWarnings:[...new Set(results.flatMap(result=>result.headWarnings||[]))],e2eMs:queryTimes.at(-1),workerMs:queryWorkerTimes.at(-1),candidates:candidateRows});
  }
  return {cases:cases.length,candidates:args.candidates,methods:Object.fromEntries(Object.entries(ranks).map(([name,list])=>[name,rankSummary(list)])),truncatedShare:observed?+(truncated/observed).toFixed(3):null,headTruncatedShare:observed?+(headTruncated/observed).toFixed(3):null,stateTokensDropped:dropped,msPerQueryP50:percentile(queryWorkerTimes,.5),msPerQueryP95:percentile(queryWorkerTimes,.95),e2eMsPerQueryP50:percentile(queryTimes,.5),e2eMsPerQueryP95:percentile(queryTimes,.95),timingScope:'Each candidate row records batch elapsed/worker time amortized per state; batches are also retained below.',dataset:datasetMetadata(dataset),rows,batchTimings:times,indexSnapshot:meta.indexSnapshot};
}

async function memory(broker,args){
  const dataset=readDataset(args.memory),data=dataset.data,pairs=[];
  if(!Array.isArray(data.cases)||!data.cases.length||!data.memories||typeof data.memories!=='object')throw Object.assign(new Error('O dataset --memory precisa conter casos e memórias.'),{code:'LAYA_BENCH_DATASET_INVALID'});
  for(const item of data.cases){
    if(!item||typeof item.objective!=='string'||!Array.isArray(item.relevant)||!Array.isArray(item.unrelated))throw Object.assign(new Error('Formato de caso de memória inválido.'),{code:'LAYA_BENCH_DATASET_INVALID'});
    for(const id of item.relevant){if(typeof data.memories[id]!=='string')throw Object.assign(new Error(`Memória ausente: ${id}`),{code:'LAYA_BENCH_DATASET_INVALID'});pairs.push({objective:item.objective,memory:data.memories[id],label:true});}
    for(const id of item.unrelated){if(typeof data.memories[id]!=='string')throw Object.assign(new Error(`Memória ausente: ${id}`),{code:'LAYA_BENCH_DATASET_INVALID'});pairs.push({objective:item.objective,memory:data.memories[id],label:false});}
  }
  if(!pairs.length)throw Object.assign(new Error('O dataset --memory não gerou pares.'),{code:'LAYA_BENCH_DATASET_INVALID'});
  const questions={
    applies:{type:'noul',instructions:'Would a developer need to follow this note while doing this task?',criteria:{true:'the note constrains or guides how this task must be done',false:'the note is about a different subject and does not affect this task'}},
    pick:{type:'choice',instructions:'Is the note relevant to the task?',criteria:{A:'the note must be followed while doing this task',B:'the note is about a different subject'}}
  };
  const batchTimings=[],raw=await runBatch(broker,pairs.map(pair=>'Task: '+pair.objective+'\nNote: '+pair.memory),questions,args,batchTimings),rows=[];
  let truncated=0,headTruncated=0,dropped=0;
  pairs.forEach((pair,index)=>{
    const result=raw[index];
    rows.push(memoryPairEvidence(pair,index,result));
    truncated+=result.truncated?1:0;headTruncated+=result.headTruncated?1:0;dropped+=result.stateTokensDropped;
  });
  const lexical=pair=>{const terms=queryTerms(pair.objective);for(const term of queryTerms(pair.memory))if(terms.has(term))return true;return false;};
  const selective=[.6,.7,.8,.9,.95].map(threshold=>{const kept=pairs.filter(pair=>pair.noulConfidence>=threshold);return {threshold,coverage:+(kept.length/pairs.length).toFixed(3),accuracy:kept.length?+(kept.filter(pair=>(pair.noul>=.5)===pair.label).length/kept.length).toFixed(3):null};});
  const positives=pairs.filter(pair=>pair.label).length,e2e=pairs.map(pair=>pair.e2eMs).filter(Number.isFinite),worker=pairs.map(pair=>pair.workerMs).filter(Number.isFinite);
  return {pairs:pairs.length,positives,majorityAccuracy:+(Math.max(positives,pairs.length-positives)/pairs.length).toFixed(3),lexical:classification(pairs,lexical),layaNoul:classification(pairs,pair=>pair.noul>=.5),layaChoice:classification(pairs,pair=>pair.choice==='A'),layaNoulSelective:selective,msPerPairP50:+percentile(worker,.5).toFixed(1),e2eMsPerPairP50:+percentile(e2e,.5).toFixed(1),truncatedShare:+(truncated/pairs.length).toFixed(3),headTruncatedShare:+(headTruncated/pairs.length).toFixed(3),stateTokensDropped:dropped,dataset:datasetMetadata(dataset),rows,batchTimings,timingScope:'Each pair records batch elapsed/worker time amortized per state; requests use configured batch size.'};
}

export async function buildReport(args){
  const status=layaStatus();
  if(!status.runtime||!status.weights)throw Object.assign(new Error('Perfil Laya não instalado. Execute: node bin/bbrainx.mjs laya install'),{code:'LAYA_NOT_INSTALLED'});
  const broker=new LayaBroker({startMs:args.timeoutMs,deadlineMs:args.timeoutMs});
  const started=performance.now();
  try{
    if(!await broker.start())throw Object.assign(new Error('Não foi possível iniciar o worker Laya.'),{code:'LAYA_START_FAILED'});
    const coldStartMs=+(performance.now()-started).toFixed(2),store=args.project?new BrainStore():null;
    try{
      const project=args.project&&store?store.project(args.project):null;
      const projectGit=project?gitState(project.root):null,indexSnapshot=project?.snapshot??null;
      const report={schemaVersion:1,kind:'laya-decision-bench',observedAt:new Date().toISOString(),platform:process.platform+' '+process.arch,profile:status.package+' · '+status.checkpoint,project:project?{id:args.project,indexSnapshot}:null,datasets:{cases:null,memory:null},model:{package:LAYA.package,version:LAYA.version,license:LAYA.license,revision:LAYA.revision,checkpoint:LAYA.checkpoint,files:LAYA.files},host:hardware(),commit:{benchmark:gitState(process.cwd()),project:projectGit},config:{candidates:args.candidates,maxLen:args.maxLen,batchSize:args.batchSize,timeoutMs:args.timeoutMs},coldStartMs,runtime:broker.info,allSeenValidation:true,sectionErrors:[]};
      if(args.cases){try{report.retrieval=await retrieval(broker,args,store,{indexSnapshot});report.datasets.cases=report.retrieval.dataset;}catch(error){report.sectionErrors.push({section:'retrieval',code:error.code||'LAYA_BENCH_FAILED',message:error.message||'Falha na avaliação de busca.'});}}
      if(args.memory){try{report.memory=await memory(broker,args);report.datasets.memory=report.memory.dataset;}catch(error){report.sectionErrors.push({section:'memory',code:error.code||'LAYA_BENCH_FAILED',message:error.message||'Falha na avaliação de memória.'});}}
      report.caveats=['Resultados observados nesta máquina e neste snapshot; não afirmam custo monetário.','As respostas e ranks são preservados, sem texto de consulta, conteúdo de arquivo ou texto de memória no relatório.','Cada dataset incluído foi avaliado diretamente e é considerado visto; isto não constitui validação cega.','A variante safeFallback conserva o rank lexical quando há truncamento ou score não finito; não altera rótulos, gold ou agregados históricos.','Tempo por candidato/par é amortizado dentro do lote; batchTimings contém o tempo agregado e o tempo informado pelo worker.'];
      return report;
    }finally{store?.close();}
  }finally{broker.stop();}
}

async function main(argv=process.argv.slice(2)){
  try{
    const args=parseBenchArgs(argv),report=await buildReport(args),serialized=JSON.stringify(report,null,2)+'\n';
    if(args.out)fs.writeFileSync(args.out,serialized,{mode:0o600});
    process.stdout.write(serialized);
    if(report.sectionErrors?.length)process.exitCode=2;
  }catch(error){
    const output={schemaVersion:1,kind:'laya-decision-bench',error:{code:error.code||'LAYA_BENCH_FAILED',message:error.message||'Falha no benchmark.'}};
    process.stdout.write(JSON.stringify(output,null,2)+'\n');process.exitCode=2;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)void main();
