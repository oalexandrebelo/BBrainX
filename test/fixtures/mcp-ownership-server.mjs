import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { createEngine } from '../../src/capability.mjs';
import { serveMcpStdio } from '../../src/mcp.mjs';

// Capacidades de teste com trabalho cooperativo real; o motor e o transporte são os do produto.
const started=[],completed=[],aborted=[];
const event=(type,label)=>process.send?.({type,label});
const engine=createEngine({name:'ownership-fixture',version:'1',capabilities:{
  'ownership.work':{description:'Wait before recording a completed operation.',access:'public',timeoutMs:5000,
    input:z.object({label:z.string()}),output:z.object({label:z.string()}),
    async run({input,context}){
      started.push(input.label);event('started',input.label);
      try{await sleep(250,undefined,{signal:context.signal});}
      catch(error){aborted.push(input.label);event('aborted',input.label);throw error;}
      completed.push(input.label);event('completed',input.label);return {label:input.label};
    }},
  'ownership.inspect':{description:'Read the operation ledger.',access:'public',
    input:z.object({}),output:z.object({started:z.array(z.string()),completed:z.array(z.string()),aborted:z.array(z.string())}),
    run(){return {started:[...started],completed:[...completed],aborted:[...aborted]};}}
}});
try{await serveMcpStdio(engine);}finally{process.disconnect?.();}
