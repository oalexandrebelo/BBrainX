import { createHash } from 'node:crypto';

export const USAGE_VERSION = 'usage-v1-2026-10-07';
export const MAX_COUNTER = 1_000_000_000;
export const MAX_RECORD_BYTES = 16384;
const own = (x,k) => Object.hasOwn(x,k);
export function check(condition, code) { if (!condition) throw Object.assign(new Error(code), {code}); }
export function object(value, fields, code = 'INVALID_OBJECT') {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  check(Object.keys(value).every(k => fields.includes(k)), 'UNKNOWN_FIELD');
  return value;
}
export function id(value, max = 120) {
  check(typeof value === 'string' && value.length > 0 && value.length <= max && /^[a-zA-Z0-9_.:@/+ -]+$/.test(value) && !/^\s|\s$/.test(value), 'INVALID_ID');
  return value;
}
export function digest(value) { return createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex'); }
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function count(value) { check(Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNTER, 'INVALID_TOKEN_COUNT'); return value; }
const nullable = (o,k) => !own(o,k) || o[k] === null ? null : count(o[k]);
const plus = (...v) => v.some(x=>x===null) ? null : count(v.reduce((a,b)=>a+b,0));
const remainder = (a,...b) => a===null || b.some(x=>x===null) ? null : count(a-b.reduce((x,y)=>x+y,0));
export function iso(value) {
  check(typeof value==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value), 'INVALID_TIMESTAMP');
  check(Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value, 'INVALID_TIMESTAMP'); return value;
}
export function sha(value) { check(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'INVALID_SHA256'); return value; }
export function decimalUnits(value, decimals) {
  check(typeof value === 'string' && new RegExp('^(0|[1-9][0-9]{0,8})(\\.[0-9]{1,'+decimals+'})?$').test(value), 'INVALID_MONEY_DECIMAL');
  const [whole, fraction=''] = value.split('.'); return BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0'));
}
export function moneyText(units) {
  const n=BigInt(units), sign=n<0n?'-':''; const a=n<0n?-n:n;
  const tail=(a%1_000_000_000_000n).toString().padStart(12,'0').replace(/0+$/,'');
  return sign+(a/1_000_000_000_000n)+(tail?'.'+tail:'');
}
const output = () => ({inputTotal:null,inputUncached:null,cacheRead:null,cacheWrite:null,outputTotal:null,outputReasoning:null,totalTokens:null,cacheWrite5m:null,cacheWrite1h:null,priceable:true});

/** Adapters explícitos de usage final. Campo ausente continua desconhecido; nunca tokeniza respostas. */
export function normalizeUsage(format, usage) {
  const n=output();
  check(['openai-responses','openai-chat','anthropic-messages','gemini-generatecontent','strata-responses','strata-chat'].includes(format),'UNSUPPORTED_USAGE_FORMAT');
  if (usage===null) return {...n,priceable:false};
  if (format.startsWith('openai-') || format.startsWith('strata-')) {
    const responses=format.endsWith('-responses'), i=responses?'input_tokens':'prompt_tokens', o=responses?'output_tokens':'completion_tokens';
    const di=responses?'input_tokens_details':'prompt_tokens_details', dout=responses?'output_tokens_details':'completion_tokens_details';
    object(usage,[i,o,di,dout,'total_tokens']);
    const input=usage[di]??{}, out=usage[dout]??{};
    object(input,['cached_tokens','cache_write_tokens','audio_tokens']);
    object(out,['reasoning_tokens','audio_tokens','accepted_prediction_tokens','rejected_prediction_tokens']);
    n.inputTotal=nullable(usage,i);n.outputTotal=nullable(usage,o);n.cacheRead=nullable(input,'cached_tokens');n.cacheWrite=nullable(input,'cache_write_tokens');
    n.outputReasoning=nullable(out,'reasoning_tokens');
    n.inputUncached=remainder(n.inputTotal,n.cacheRead,n.cacheWrite);
    for(const data of [input,out]) if((nullable(data,'audio_tokens')??0)>0)n.priceable=false;
    n.totalTokens=nullable(usage,'total_tokens');
  } else if(format==='anthropic-messages') {
    object(usage,['input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens','cache_creation','server_tool_use','service_tier','inference_geo','iterations']);
    // Totais superiores são agregados; iterations não pode ser somado novamente.
    if(usage.iterations!=null){
      check(Array.isArray(usage.iterations)&&usage.iterations.length<=100,'INVALID_ITERATIONS');
      for(const it of usage.iterations){
        object(it,['type','input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens','cache_creation']);
        if(it.type!==undefined)id(it.type,40);
        const {type,...counts}=it;normalizeUsage('anthropic-messages',counts);
      }
      n.priceable=false;
    }
    n.inputUncached=nullable(usage,'input_tokens');n.cacheRead=nullable(usage,'cache_read_input_tokens');n.cacheWrite=nullable(usage,'cache_creation_input_tokens');
    n.inputTotal=plus(n.inputUncached,n.cacheRead,n.cacheWrite);n.outputTotal=nullable(usage,'output_tokens');
    if(usage.cache_creation!=null){
      object(usage.cache_creation,['ephemeral_5m_input_tokens','ephemeral_1h_input_tokens']);
      n.cacheWrite5m=nullable(usage.cache_creation,'ephemeral_5m_input_tokens');n.cacheWrite1h=nullable(usage.cache_creation,'ephemeral_1h_input_tokens');
      const split=plus(n.cacheWrite5m,n.cacheWrite1h);if(split!==null&&n.cacheWrite!==null)check(split===n.cacheWrite,'CACHE_WRITE_TOTAL_MISMATCH');
    }
    // Não armazenamos geografia, service tier ou chamadas de ferramenta: podem exigir outra tarifa.
    if(usage.server_tool_use!=null||usage.inference_geo!=null||usage.service_tier!=null)n.priceable=false;
  } else {
    object(usage,['promptTokenCount','cachedContentTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount','toolUsePromptTokenCount','serviceTier','promptTokensDetails','cacheTokensDetails','candidatesTokensDetails','toolUsePromptTokensDetails']);
    n.inputTotal=nullable(usage,'promptTokenCount');n.cacheRead=nullable(usage,'cachedContentTokenCount');
    // Cache criado no endpoint próprio não é uma criação faturada nesta chamada generateContent.
    n.cacheWrite=0;n.inputUncached=remainder(n.inputTotal,n.cacheRead);
    n.outputReasoning=nullable(usage,'thoughtsTokenCount');n.outputTotal=plus(nullable(usage,'candidatesTokenCount'),n.outputReasoning);n.totalTokens=nullable(usage,'totalTokenCount');
    if((nullable(usage,'toolUsePromptTokenCount')??0)>0||usage.serviceTier!=null)n.priceable=false;
    for(const field of ['promptTokensDetails','cacheTokensDetails','candidatesTokensDetails','toolUsePromptTokensDetails']){
      if(usage[field]==null)continue;
      check(Array.isArray(usage[field])&&usage[field].length<=20,'INVALID_MODALITY');
      for(const d of usage[field]) {object(d,['modality','tokenCount']);count(d.tokenCount);if(d.modality!=='TEXT')n.priceable=false;}
    }
  }
  for(const field of ['cacheRead','cacheWrite']) if(n[field]!==null&&n.inputTotal!==null)check(n[field]<=n.inputTotal,'CACHE_EXCEEDS_INPUT');
  if(n.inputTotal!==null&&n.cacheRead!==null&&n.cacheWrite!==null)check(n.cacheRead+n.cacheWrite<=n.inputTotal,'CACHE_EXCEEDS_INPUT');
  if(n.outputReasoning!==null&&n.outputTotal!==null)check(n.outputReasoning<=n.outputTotal,'REASONING_EXCEEDS_OUTPUT');
  const derived=plus(n.inputTotal,n.outputTotal);
  if(n.totalTokens!==null&&derived!==null)check(n.totalTokens===derived,'TOTAL_TOKEN_MISMATCH');
  n.totalTokens??=derived;
  return n;
}

function rateCard(card, entry, tokens) {
  if(card==null)return null;
  object(card,['id','currency','provider','model','format','validFrom','validUntil','scope','rates','reference']);
  id(card.id);id(card.reference,160);check(/^[A-Z]{3}$/.test(card.currency),'INVALID_CURRENCY');
  check(card.model===entry.model&&card.format===entry.format,'PRICE_MODEL_MISMATCH');
  check(card.provider===entry.provider,'PRICE_PROVIDER_MISMATCH');
  iso(card.validFrom);iso(card.validUntil);check(card.validFrom<=entry.occurredAt&&entry.occurredAt<card.validUntil,'PRICE_OUTSIDE_VALIDITY');
  check(card.scope==='uniform-text-token-only','UNSUPPORTED_PRICE_SCOPE');
  object(card.rates,['inputUncached','cacheRead','cacheWrite','cacheWrite5m','cacheWrite1h','outputTotal']);
  const normalized={}; for(const [k,v] of Object.entries(card.rates))normalized[k]=decimalUnits(v,6).toString();
  let total=0n; const buckets=['inputUncached','cacheRead','outputTotal'];
  if(tokens.cacheWrite5m!==null&&tokens.cacheWrite1h!==null)buckets.push('cacheWrite5m','cacheWrite1h');else buckets.push('cacheWrite');
  let complete=tokens.priceable;
  for(const key of buckets) {
    if(tokens[key]===null){complete=false;continue;}
    if(tokens[key]===0)continue;
    if(normalized[key]===undefined){complete=false;continue;}
    // micro-unidades monetárias / milhão de tokens => pico-unidades por token, sem float.
    total+=BigInt(tokens[key])*BigInt(normalized[key]);
  }
  return {id:card.id,currency:card.currency,provider:card.provider,reference:card.reference,validFrom:card.validFrom,validUntil:card.validUntil,
    scope:card.scope,ratesMicroPerMillion:normalized,estimatedPico:complete?total.toString():null,
    limitation:'Tarifa fornecida; somente tokens textuais. Não é fatura, custo local, assinatura, imposto ou crédito.'};
}

/** Recibo importado por chamada/tentativa. Não aceita prompt, resposta, credencial ou metadata arbitrária. */
export function normalizeCall(entry) {
  object(entry,['schemaVersion','callId','account','provider','model','harness','task','run','snapshot','configurationHash','occurredAt','format','usage','terminal','pricing','reportedCost']);
  check(entry.schemaVersion===1&&entry.terminal===true,'FINAL_USAGE_REQUIRED');
  check(Buffer.byteLength(JSON.stringify(entry))<=MAX_RECORD_BYTES,'RECORD_TOO_LARGE');
  const base={schemaVersion:1,normalizerVersion:USAGE_VERSION,callId:id(entry.callId),account:id(entry.account),provider:id(entry.provider,60),model:id(entry.model),harness:id(entry.harness),task:id(entry.task),run:id(entry.run),snapshot:sha(entry.snapshot),configurationHash:sha(entry.configurationHash),occurredAt:iso(entry.occurredAt),format:entry.format};
  const provider={ 'openai-responses':'openai','openai-chat':'openai','anthropic-messages':'anthropic','gemini-generatecontent':'google','strata-responses':'strata-local','strata-chat':'strata-local'}[entry.format];
  check(provider===entry.provider,'PROVIDER_FORMAT_MISMATCH');
  const tokens=normalizeUsage(entry.format,entry.usage), pricing=rateCard(entry.pricing,base,tokens);
  let reportedCost=null;
  if(entry.reportedCost!=null){
    object(entry.reportedCost,['currency','amount','reference']);check(/^[A-Z]{3}$/.test(entry.reportedCost.currency),'INVALID_CURRENCY');
    reportedCost={currency:entry.reportedCost.currency,pico:decimalUnits(entry.reportedCost.amount,12).toString(),reference:id(entry.reportedCost.reference,160)};
  }
  return {...base,tokens,pricing,reportedCost,provenance:'imported-not-independently-authenticated',sourceDigest:digest(entry)};
}

export function comparePair(records,spec) {
  object(spec,['id','task','snapshot','configurationHash','harness','model','provider','baselineRun','candidateRun','expectedBaselineCalls','expectedCandidateCalls','baselineAccepted','candidateAccepted','evaluatorHash','baselineEvidenceHash','candidateEvidenceHash']);
  for(const key of ['id','task','harness','model','provider','baselineRun','candidateRun'])id(spec[key]);
  for(const key of ['snapshot','configurationHash','evaluatorHash','baselineEvidenceHash','candidateEvidenceHash'])sha(spec[key]);
  for(const key of ['expectedBaselineCalls','expectedCandidateCalls'])check(Number.isSafeInteger(spec[key])&&spec[key]>0&&spec[key]<=5000,'INVALID_EXPECTED_CALLS');
  check(spec.baselineRun!==spec.candidateRun,'SAME_RUN');
  check(typeof spec.baselineAccepted==='boolean'&&typeof spec.candidateAccepted==='boolean','ACCEPTANCE_REQUIRED');
  const reasons=[];
  const arms=[spec.baselineRun,spec.candidateRun].map(run=>records.filter(r=>r.run===run));
  if(arms[0].length!==spec.expectedBaselineCalls||arms[1].length!==spec.expectedCandidateCalls)reasons.push('INCOMPLETE_DECLARED_RUN');
  for(const r of arms.flat()){
    if(['task','snapshot','configurationHash','harness','model','provider'].some(k=>r[k]!==spec[k]))reasons.push('RUN_IDENTITY_MISMATCH');
    if(r.tokens.totalTokens===null)reasons.push('USAGE_UNKNOWN');
  }
  if(!spec.baselineAccepted||!spec.candidateAccepted)reasons.push('ACCEPTED_PAIR_REQUIRED');
  const sum=rows=>rows.reduce((a,r)=>a+(r.tokens.totalTokens??0),0);
  const comparable=reasons.length===0;
  const baselineTokens=comparable?sum(arms[0]):null,candidateTokens=comparable?sum(arms[1]):null;
  const money=[];
  if(comparable)for(const basis of ['reported','estimated']){
    const costs=arms.map(rows=>rows.map(r=>basis==='reported'?r.reportedCost:(r.pricing?.estimatedPico==null?null:{currency:r.pricing.currency,pico:r.pricing.estimatedPico})));
    if(costs.flat().some(c=>c===null))continue;
    const currencies=new Set(costs.flat().map(c=>c.currency));if(currencies.size!==1)continue;
    const [a,b]=costs.map(rows=>rows.reduce((sum,c)=>sum+BigInt(c.pico),0n));
    money.push({basis,currency:[...currencies][0],baseline:moneyText(a),candidate:moneyText(b),difference:moneyText(a-b)});
  }
  return {id:spec.id,comparable,money,reasons:[...new Set(reasons)],baselineTokens,candidateTokens,
    savedTokens:comparable?baselineTokens-candidateTokens:null,
    savingsPercent:comparable&&baselineTokens>0?100*(baselineTokens-candidateTokens)/baselineTokens:null,
    causalProof:false,coverage:'expected-counts-and-acceptance-declared-by-importer',
    limitation:'Diferença pareada descritiva. Não autentica completude, verificador ou causalidade; não atribui cache do provedor ao BBrainX.'};
}
