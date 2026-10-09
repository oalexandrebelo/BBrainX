import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';import {McpRateWindow} from '../src/mcp-flow.mjs';

// Microbenchmark dos dois algoritmos sob a mesma sequência. Não é throughput do MCP/LLM.
const out=path.resolve(process.argv[2]??'artifacts/mcp-transport/benchmark');fs.mkdirSync(out,{recursive:true});
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const events=240000,perMs=1000,variants=[];
for(const calls of [300,20000]){
  // Alterna enchimento, recusas e expiração em rajadas; evita medir só uma fila vazia.
  const times=new Float64Array(events);for(let i=0;i<events;i++)times[i]=Math.floor(i/(calls+10))*perMs+(i%(calls+10)>=calls?1:0);
  const run=kind=>{
    let time=0,accepted=0,recent=[];
    const ring=kind==='ring'?new McpRateWindow({calls,perMs,now:()=>time}):null;
    const take=ring?()=>ring.take():()=>{while(recent.length&&time-recent[0]>=perMs)recent.shift();if(recent.length>=calls)return false;recent.push(time);return true;};
    const start=performance.now();for(const value of times){time=value;if(take())accepted++;}
    return {milliseconds:performance.now()-start,accepted};
  };
  run('shift');run('ring');const pairs=[];
  for(let i=0;i<7;i++){
    const order=i%2?['ring','shift']:['shift','ring'],sample={order};for(const kind of order)sample[kind]=run(kind);
    assert.equal(sample.shift.accepted,sample.ring.accepted);pairs.push(sample);
  }
  const shift=median(pairs.map(x=>x.shift.milliseconds)),ring=median(pairs.map(x=>x.ring.milliseconds));
  variants.push({calls,perMs,events,pairs,medianMs:{shift,ring},ratioOfMedians:shift/ring});
}
const report={schemaVersion:1,scope:'exact-window-algorithm-only',observedAt:new Date().toISOString(),environment:{node:process.version,
  platform:process.platform,architecture:process.arch,logicalCpus:os.cpus().length,memoryBytes:os.totalmem()},variants,
  sourceSha256:createHash('sha256').update(fs.readFileSync(new URL('../src/mcp-flow.mjs',import.meta.url))).digest('hex'),
  notes:['Sete pares com ordem alternada e um warmup separado por algoritmo.','calls=300 é a política padrão; calls=20000 é uma configuração ampliada para estressar expiração.',
  'Relógio de admissão controlado, tempo de benchmark observado. Sem inferência, rede, faturamento ou tarefa aceita.','Medianas locais não são SLA, teste estatístico de superioridade nem speedup end-to-end.']};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
