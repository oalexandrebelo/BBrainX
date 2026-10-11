import {LaneRegistry} from '../../src/lanes/registry.mjs';
import {startLaneHttpServer} from '../../src/lanes/service.mjs';
const [home,lane]=process.argv.slice(2);const registry=new LaneRegistry(home);
const service=await startLaneHttpServer(registry,{project:'product',lane,name:'web',handler:(req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({lane,route:req.url}));}});
process.send?.({type:'ready',url:service.url,generation:service.generation});
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await service.close();registry.close();process.exit(0);}
process.on('message',m=>{if(m?.op==='stop')void stop();});process.once('disconnect',()=>void stop());
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>void stop());
