import { moneyText, check } from './contract.mjs';
import { readUsage } from './store.mjs';

const counters=['inputTotal','inputUncached','cacheRead','cacheWrite','outputTotal','outputReasoning','totalTokens'];
/** Agregação limitada a 5.000 recibos; desconhecido não entra como zero observado. */
export function summarizeUsage(snapshot) {
  const {records,pairs=[],truncated=false,limit=5000}=snapshot;
  check(Array.isArray(records)&&records.length<=limit,'INVALID_SUMMARY_SIZE');
  const tokens=Object.fromEntries(counters.map(k=>[k,{knownSum:0,knownCalls:0,unknownCalls:0}]));
  const money=new Map(),groups=new Map();let coveredCacheInput=0,coveredCacheRead=0,cacheCoveredCalls=0;
  const addMoney=(currency,basis,pico)=>{
    const key=currency+':'+basis;if(!money.has(key))money.set(key,{currency,basis,pico:0n,calls:0});
    const g=money.get(key);g.pico+=BigInt(pico);g.calls++;
  };
  for(const r of records){
    for(const k of counters){const v=r.tokens[k];if(v===null)tokens[k].unknownCalls++;else{tokens[k].knownSum+=v;tokens[k].knownCalls++;}}
    if(r.tokens.inputTotal!==null&&r.tokens.cacheRead!==null){coveredCacheInput+=r.tokens.inputTotal;coveredCacheRead+=r.tokens.cacheRead;cacheCoveredCalls++;}
    if(r.reportedCost)addMoney(r.reportedCost.currency,'reported',r.reportedCost.pico);
    if(r.pricing?.estimatedPico!==null&&r.pricing?.estimatedPico!==undefined)addMoney(r.pricing.currency,'estimated',r.pricing.estimatedPico);
    const key=JSON.stringify([r.provider,r.model,r.harness]);
    if(!groups.has(key))groups.set(key,{provider:r.provider,model:r.model,harness:r.harness,calls:0,totalTokens:0,unknownTokens:0});
    const g=groups.get(key);g.calls++;if(r.tokens.totalTokens===null)g.unknownTokens++;else g.totalTokens+=r.tokens.totalTokens;
  }
  for(const g of Object.values(tokens)){g.value=g.knownCalls?g.knownSum:null;g.complete=records.length>0&&g.unknownCalls===0&&!truncated;}
  return {importedCalls:records.length,tokens,cache:{readTokens:cacheCoveredCalls?coveredCacheRead:null,inputTokens:cacheCoveredCalls?coveredCacheInput:null,
    ratio:coveredCacheInput>0?coveredCacheRead/coveredCacheInput:null,coveredCalls:cacheCoveredCalls,unknownCalls:records.length-cacheCoveredCalls},
    moneyTruncated:money.size>40,money:[...money.values()].slice(0,40).map(g=>({currency:g.currency,basis:g.basis,amount:moneyText(g.pico),calls:g.calls,missingCalls:records.length-g.calls})),
    groups:[...groups.values()].sort((a,b)=>b.calls-a.calls).slice(0,100),groupsTruncated:groups.size>100,
    calls:records.slice(0,50).map(r=>({id:r.callId,provider:r.provider,model:r.model,harness:r.harness,occurredAt:r.occurredAt,revision:r.revision,totalTokens:r.tokens.totalTokens,cacheRead:r.tokens.cacheRead,provenance:r.provenance})),
    pairs,truncated,limit,pairsTruncated:snapshot.pairsTruncated??false,
    observationCoverage:'Somente recibos importados; quantidade de chamadas não instrumentadas é desconhecida.',
    providerSavingsAttributedToBBrainX:null};
}

/** Eventos novos possuem uma referência local comparável; eventos antigos continuam sem baseline. */
export function summarizeContext(events,{truncated=false}={}){
  let packs=0,payloadTokens=0,knownPairs=0,referenceTokens=0,pairedPayloadTokens=0;
  const recent=[];
  for(const event of events){
    if(event.type!=='context.compiled')continue;
    const p=event.payload;
    if(!Number.isSafeInteger(p.payloadTokens)||p.payloadTokens<0)continue;
    packs++;payloadTokens+=p.payloadTokens;
    const comparable=p.measurementVersion==='candidate-window-v1'&&Number.isSafeInteger(p.referenceTokens)&&p.referenceTokens>=0;
    if(comparable){knownPairs++;referenceTokens+=p.referenceTokens;pairedPayloadTokens+=p.payloadTokens;}
    if(recent.length<40)recent.push({at:event.created,packId:p.packId,payloadTokens:p.payloadTokens,referenceTokens:comparable?p.referenceTokens:null,sourceCount:p.sourceCount??null});
  }
  return {packs,payloadTokens:packs?payloadTokens:null,knownPairs,unknownPairs:packs-knownPairs,
    referenceTokens:knownPairs?referenceTokens:null,pairedPayloadTokens:knownPairs?pairedPayloadTokens:null,
    reducedTokens:knownPairs?referenceTokens-pairedPayloadTokens:null,
    reductionPercent:knownPairs&&referenceTokens>0?100*(referenceTokens-pairedPayloadTokens)/referenceTokens:null,
    encoding:'o200k_base',baseline:'mesmos candidatos recuperados e cabeçalho; antes de quota/orçamento',
    notProviderSavings:true,deliveredToModelConfirmed:false,truncated,recent};
}

export function usageOverview(brain,project){
  brain.project(project); // Autoridade do host, não projeto escolhido no recibo.
  // No máximo 5.000 linhas materializadas. Sem índice (project,seq) na base, a busca pode visitar mais linhas; não é limite de I/O.
  const rows=brain.db.prepare('SELECT type,payload,created FROM events WHERE project=? ORDER BY seq DESC LIMIT 5001').all(project);
  const context=summarizeContext(rows.slice(0,5000).map(r=>({...r,payload:JSON.parse(r.payload)})),{truncated:rows.length>5000});
  return {schemaVersion:1,project,generatedAt:new Date().toISOString(),context,usage:summarizeUsage(readUsage(brain.home,project)),
    mode:'local-only',containsPrompts:false,containsCredentials:false,
    scope:'Memória e recibos têm snapshots separados; este painel não é uma decisão de autorização ou cobrança.'};
}
