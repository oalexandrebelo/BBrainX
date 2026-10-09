// Processo de teste com trabalho real de texto/timers. Não executa nem simula inferência neural.
import { createEngine } from '../../src/capability.mjs';
import { serveMcpStdio } from '../../src/mcp.mjs';
import { z } from 'zod';
const options=JSON.parse(process.argv[2]??'{}');
let started=0,aborted=0;
const engine=createEngine({name:'pressure-domain',version:'1',capabilities:{
  work:{description:'bounded deterministic work',access:'authenticated',timeoutMs:5000,
    input:z.object({text:z.string().max(100),delayMs:z.number().int().min(0).max(1000).default(0),bytes:z.number().int().min(0).max(524288).default(0)}).strict(),
    output:z.object({text:z.string()}).strict(),
    run:({input,context})=>new Promise((resolve,reject)=>{
      started++;process.send?.({event:'started',started});
      const stop=()=>{clearTimeout(timer);aborted++;reject(new Error('cancelled'));};
      const timer=setTimeout(()=>{context.signal.removeEventListener('abort',stop);resolve({text:input.bytes?'x'.repeat(input.bytes):input.text});},input.delayMs);
      if(context.signal.aborted)stop();else context.signal.addEventListener('abort',stop,{once:true});
    })}
}});
const finish=message=>new Promise(resolve=>{if(process.connected)process.send(message,resolve);else resolve();});
try{
  const running=serveMcpStdio(engine,{principal:{id:'host'},shutdownMs:200,...options});
  void running.catch(()=>{});process.send?.({event:'ready'});
  const report=await running;await finish({event:'finished',report,started,aborted});
}catch(error){await finish({event:'finished',error:error.code,report:error.report,started,aborted});process.exitCode=1;}
finally{if(process.connected)process.disconnect();}
