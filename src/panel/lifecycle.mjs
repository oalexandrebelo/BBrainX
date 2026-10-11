import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { panelTarget, probePanel, panelScope } from './probe.mjs';
import { inspectPanelAssets } from './assets.mjs';

const flights=new Map();
const build=fileURLToPath(new URL('../../dist/',import.meta.url));
const hint=state=>({unreachable:'Inicie com panel start.', 'missing-assets':'Execute npm run build nesta instalação.',incompatible:'A porta atende outro serviço ou uma versão sem readiness. Não encerre o ocupante; confira a porta.',timeout:'A leitura excedeu o prazo. Confira o processo e tente novamente.', 'different-state':'Outro diretório de estado está atendendo esta porta. Use outra porta ou a configuração de estado correspondente.', 'connection-error':'Confira endereço e processo local.'}[state]||'Painel disponível na última observação.');
export async function panelStatus(url,{home}={}){const result=await probePanel(url,{expectedScope:panelScope(home)});return {...result,hint:hint(result.state)};}

/** Coalescência só da abertura nesta instância. Entre processos, o bind exclusivo do SO arbitra. */
export function ensurePanel(value,{assetsDir=build,home}={}) {
  const target=panelTarget(value),key=JSON.stringify([target.url,path.resolve(assetsDir),home??null]);
  if(flights.has(key))return flights.get(key);
  const work=(async()=>{
    const before=await panelStatus(target.url,{home});
    if(before.state==='ready')return {status:before,owned:false,close:async()=>{}};
    if(before.state!=='unreachable')return {status:before,owned:false,close:async()=>{}};
    const assets=inspectPanelAssets(assetsDir);
    if(!assets.ready)return {status:{...before,state:'missing-assets',missingAssets:assets.missingCount,hint:hint('missing-assets')},owned:false,close:async()=>{}};
    // Imports pesados/dependências só depois da sondagem e do build. Não instala nem baixa nada.
    let store,server;
    try{
      const [{BrainStore},{startServer}]=await Promise.all([import('../store.mjs'),import('../server.mjs')]);
      store=new BrainStore(home);server=await startServer(store,{port:target.port,assetsDir});
      const status=await panelStatus(target.url,{home});
      if(status.state!=='ready'){await server.close();store.close();return {status,owned:false,close:async()=>{}};}
      let closed=false;
      return {status,owned:true,async close(){if(closed)return;closed=true;await server.close();store.close();}};
    }catch(e){
      if(server)await server.close();store?.close();
      if(e.code==='EADDRINUSE'){
        // Pode ter perdido uma corrida de startup. Só reutiliza quem passou no mesmo contrato.
        for(let i=0;i<5;i++){const status=await panelStatus(target.url,{home});if(status.state==='ready')return {status,owned:false,close:async()=>{}};await delay(100);}
        return {status:{...before,state:'incompatible',hint:hint('incompatible')},owned:false,close:async()=>{}};
      }
      throw e;
    }
  })();
  flights.set(key,work);void work.then(()=>flights.delete(key),()=>flights.delete(key));return work;
}
