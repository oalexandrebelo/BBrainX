import http from 'node:http';
import { ensure } from '../primitives.mjs';

/**
 * SDK para servidor Node cooperativo. Quem atenderá mantém o socket que o SO escolheu (port 0).
 * Não executa shell, não gerencia descendentes e não identifica um processo pelo PID armazenado.
 */
export async function startLaneHttpServer(registry,{project,lane,name,handler,maxConnections=32}){
  ensure(typeof handler==='function','INVALID_SERVICE_HANDLER');
  ensure(Number.isInteger(maxConnections)&&maxConnections>=1&&maxConnections<=128,'INVALID_CONNECTION_LIMIT');
  const binding=registry.verifyBinding(project,lane);
  const generation=registry.reserveService(project,lane,name,binding.epoch),sockets=new Set();
  const server=http.createServer((req,res)=>{
    const host='127.0.0.1:'+server.address().port;
    if(req.headers.host!==host||(req.headers.origin&&req.headers.origin!=='http://'+host)||['cross-site','same-site'].includes(req.headers['sec-fetch-site'])){
      res.writeHead(403,{'content-type':'text/plain','cache-control':'no-store'});res.end('REQUEST_SCOPE_REJECTED');return;
    }
    try {
      const result=handler(req,res);
      if(result?.catch)result.catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();});
    }catch{if(!res.headersSent)res.writeHead(500);res.end();}
  });
  server.maxConnections=maxConnections;server.requestTimeout=30000;server.headersTimeout=10000;
  server.keepAliveTimeout=1000;server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.setTimeout(30000,()=>socket.destroy());});
  // Exactly one actual bind. A port is never probed then released before another process binds it.
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port:0,exclusive:true},resolve);});
    registry.serviceListening(project,lane,name,generation,server.address().port);
  }catch(e){for(const s of sockets)s.destroy();if(server.listening)await new Promise(resolve=>server.close(resolve));registry.releaseService(project,lane,name,generation);throw e;}
  let closing;
  return {url:'http://127.0.0.1:'+server.address().port,project,lane,name,generation,server,
    close(){
      if(closing)return closing;
      closing=new Promise((resolve,reject)=>{
        server.close(error=>{
          if(error){reject(error);return;}
          try{registry.releaseService(project,lane,name,generation);resolve();}catch(e){reject(e);}
        });
        for(const socket of sockets)socket.destroy();
      });return closing;
    }
  };
}
