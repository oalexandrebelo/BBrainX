import { performance } from 'node:perf_hooks';
import { search } from './retrieval.mjs';

const percentile=(sorted,q)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))]:null;
/** Intervalo de Wilson a 95 % para uma proporção: com poucos casos, é ele que diz quanto o número pode estar errado. */
export function wilson(successes,total){
  if(!total)return null;
  const z=1.959964, p=successes/total, scale=1+z*z/total, center=(p+z*z/(2*total))/scale, half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/scale;
  return [Math.max(0,center-half),Math.min(1,center+half)].map(value=>Math.round(value*1000)/1000);
}
function summary(rows){
  const ranks=rows.map(x=>x.rank), times=rows.map(x=>x.milliseconds).sort((a,b)=>a-b), count=k=>ranks.filter(r=>r!==null&&r<=k).length, hit=k=>count(k)/rows.length;
  return {cases:rows.length,mrr:ranks.reduce((sum,r)=>sum+(r?1/r:0),0)/rows.length,hit1:hit(1),hit3:hit(3),hit10:hit(10),hit1Interval95:wilson(count(1),rows.length),hit10Interval95:wilson(count(10),rows.length),notFound:ranks.filter(r=>r===null).length,p50Ms:percentile(times,.5),p95Ms:percentile(times,.95)};
}
/**
 * Mede a recuperação contra casos rotulados (consulta → caminhos esperados).
 * Mede só a ordem dos trechos devolvidos; não mede tarefa aceita, custo de provedor nem qualidade de resposta.
 */
export function evaluateRetrieval(store,project,cases,{limit=50}={}){
  const rows=cases.map(item=>{
    const begin=performance.now(), items=search(store,project,item.query,limit).items, milliseconds=performance.now()-begin;
    const index=items.findIndex(x=>item.expect.includes(x.path));
    return {query:item.query,kind:item.kind||'geral',expect:item.expect,rank:index<0?null:index+1,first:items[0]?.path||null,milliseconds};
  });
  const kinds={};for(const row of rows)(kinds[row.kind]||=[]).push(row);
  // O snapshot identifica o corpus medido: o mesmo conjunto de casos dá outro número quando os arquivos mudam.
  return {kind:'labeled-retrieval-only',limit,snapshot:store.project(project).snapshot,total:summary(rows),byKind:Object.fromEntries(Object.entries(kinds).map(([name,list])=>[name,summary(list)])),rows};
}
