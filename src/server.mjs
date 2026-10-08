import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ensure } from './primitives.mjs';
import { makeEngine, VERSION } from './engine.mjs';
import { doctor } from './host.mjs';
import { usageOverview } from './usage/summary.mjs';
import { controlOverview } from './control.mjs';

const dist=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.png':'image/png','.webm':'video/webm','.mp4':'video/mp4'};
function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function json(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));}
async function body(req){let bytes=0,parts=[];for await(const part of req){bytes+=part.length;ensure(bytes<=65536,'PAYLOAD_TOO_LARGE');parts.push(part);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}

/** Loopback, same-origin e CSRF. Fronteira de confiança: usuário local do SO, não multi-tenant. */
export async function startServer(store,{port=4317}={}){
  ensure(Number.isInteger(port)&&port>=0&&port<65536,'INVALID_PORT');
  const csrf=randomBytes(32).toString('hex');let address;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    try{
      const expected='127.0.0.1:'+address.port;
      ensure(req.headers.host===expected,'HOST_REJECTED');
      ensure(!req.headers.origin||req.headers.origin==='http://'+expected,'ORIGIN_REJECTED');
      ensure(!['cross-site','same-site'].includes(req.headers['sec-fetch-site']),'ORIGIN_REJECTED');
      const url=new URL(req.url,'http://'+expected);
      if(req.method==='GET'&&url.pathname==='/api/bootstrap')return json(res,200,{version:VERSION,csrf,projects:store.projects(),doctor:doctor(),mode:'local'});
      if(req.method==='GET'&&url.pathname==='/api/usage')return json(res,200,usageOverview(store,url.searchParams.get('project')));
      if(req.method==='GET'&&url.pathname==='/api/control')return json(res,200,controlOverview(store,url.searchParams.get('project')));
      if(req.method==='GET'&&url.pathname==='/api/project'){
        const project=url.searchParams.get('project');return json(res,200,{project:store.project(project),tasks:store.tasks(project),memories:store.memories(project),events:store.events(project)});
      }
      if(req.method==='POST'&&url.pathname==='/api/invoke'){
        ensure(equal(req.headers['x-bbrainx-csrf'],csrf),'CSRF_REJECTED');
        ensure(req.headers['content-type']?.startsWith('application/json'),'CONTENT_TYPE_REJECTED');
        const data=await body(req);ensure(typeof data.action==='string'&&data.args,'INVALID_REQUEST');
        const engine=makeEngine(store,store.projects().map(x=>x.id));
        const result=await engine.invoke(data.action,data.args,{principal:{id:'local-dashboard'},source:'direct'});return json(res,200,result);
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
      const relative=decodeURIComponent(url.pathname).replace(/^\/+/,''), target=path.resolve(dist,relative==='observatory/'?'observatory/index.html':relative||'index.html');
      ensure(target.startsWith(dist+path.sep),'UNSAFE_PATH');
      if(!fs.existsSync(target)||!fs.statSync(target).isFile())return json(res,404,{error:'NOT_FOUND',hint:'Execute npm run build antes de iniciar o painel.'});
      res.writeHead(200,{'Content-Type':contentTypes[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});
      if(req.method==='HEAD')res.end();else fs.createReadStream(target).on('error',()=>res.destroy()).pipe(res);
    }catch(e){if(!res.headersSent)json(res,['HOST_REJECTED','ORIGIN_REJECTED','CSRF_REJECTED'].includes(e.code)?403:400,{error:e.code||'INVALID_REQUEST'});else res.destroy();}
  });
  server.requestTimeout=30000;server.headersTimeout=10000;server.maxRequestsPerSocket=100;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{address=server.address();resolve();});});
  return {url:'http://127.0.0.1:'+address.port,close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
