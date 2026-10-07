// Exemplo funcional de integração de um servidor Node cooperativo; não executa o shell do agente.
import {LaneRegistry} from '../src/lanes/registry.mjs';
import {startLaneHttpServer} from '../src/lanes/service.mjs';
import {stateHome} from '../src/host.mjs';
const [project,lane]=process.argv.slice(2),registry=new LaneRegistry(stateHome());
let service;
try{
  service=await startLaneHttpServer(registry,{project,lane,name:'web',handler:(req,res)=>{
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({project,lane,route:req.url,demonstration:true}));
  }});
  console.log(JSON.stringify({url:service.url,project,lane,generation:service.generation}));
}catch(e){registry.close();throw e;}
let stopping=false;
async function stop(){if(stopping)return;stopping=true;try{await service.close();}finally{registry.close();}}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>stop().then(()=>process.exit(0)).catch(()=>process.exit(1)));
