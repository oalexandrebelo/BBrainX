import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { stateHome } from '../state-home.mjs';

export function panelScope(home=stateHome()){let canonical;try{canonical=fs.realpathSync(home);}catch{canonical=path.resolve(home);}return createHash('sha256').update('bbrainx-panel-state-v1\0'+canonical).digest('hex');}

import { performance } from 'node:perf_hooks';

/** Sem DNS, proxy, redirects, credenciais ou dependências instaladas. Normaliza aliases para o bind real. */
export function panelTarget(value='http://127.0.0.1:4317') {
  if(typeof value!=='string'||value.length>512||/[\x00-\x20\x7f\\]/.test(value))throw new TypeError('INVALID_PANEL_URL');
  // Conferir o literal antes de WHATWG normalizar números IP alternativos e percent encoding.
  if(!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::[0-9]{1,5})?(?:\/(?:atlas\.html|observatory\/?)?)?$/.test(value))throw new TypeError('INVALID_PANEL_URL');
  const url=new URL(value),port=Number(url.port||80);
  if(!Number.isInteger(port)||port<1||port>65535)throw new TypeError('INVALID_PANEL_PORT');
  const target=new URL(url.href);target.hostname='127.0.0.1';if(target.pathname==='/observatory')target.pathname='/observatory/';
  return {url:target.href,origin:target.origin,port,normalized:target.href!==url.href};
}

/** A identidade é declarada pelo servidor local, não autenticação contra outro processo do mesmo usuário. */
export function probePanel(value, {timeoutMs=1500,maxBytes=16384,expectedScope}={}) {
  const target=panelTarget(value);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||!Number.isSafeInteger(maxBytes)||maxBytes<128||maxBytes>65536)throw new TypeError('INVALID_PANEL_PROBE_LIMIT');
  return new Promise(resolve=>{
    const start=performance.now();let done=false,timer,request;
    const finish=(state,extra={})=>{if(done)return;done=true;clearTimeout(timer);request?.destroy();resolve({schemaVersion:1,...target,state,...extra,observedAt:new Date().toISOString(),durationMs:performance.now()-start});};
    request=http.request({hostname:'127.0.0.1',port:target.port,path:'/api/readiness',method:'GET',agent:false,maxHeaderSize:8192,headers:{Accept:'application/json'}},res=>{
      res.on('error',()=>finish('incompatible'));
      if(![200,503].includes(res.statusCode)||!/^application\/json(?:;|$)/i.test(res.headers['content-type']||''))return finish('incompatible');
      let size=0;const chunks=[];
      res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)return finish('incompatible');chunks.push(chunk);});
      res.once('end',()=>{
        try{
          const r=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));
          if(r.schemaVersion!==1||r.service!=='bbrainx-panel'||r.mode!=='loopback'||typeof r.version!=='string'||!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(r.version)||
             typeof r.scopeId!=='string'||!/^[a-f0-9]{64}$/.test(r.scopeId)||typeof r.instanceId!=='string'||!/^[a-f0-9]{32}$/.test(r.instanceId)||typeof r.ready!=='boolean'||r.assets?.scope!=='entrypoints-and-direct-assets'||
             !Number.isSafeInteger(r.assets.missingCount)||r.assets.missingCount<0||r.assets.missingCount>256||r.ready!==(r.assets.missingCount===0)||
             (r.ready?res.statusCode!==200:res.statusCode!==503))return finish('incompatible');
          if(expectedScope!==undefined&&r.scopeId!==expectedScope)return finish('different-state');
          finish(r.ready?'ready':'missing-assets',{version:r.version,instanceId:r.instanceId,missingAssets:r.assets.missingCount});
        }catch{finish('incompatible');}
      });
    });
    request.once('error',e=>finish(e.code==='ECONNREFUSED'?'unreachable':'connection-error'));
    // setTimeout do socket, sozinho, não encerra o request. Deadline inclui leitura do corpo.
    timer=setTimeout(()=>finish('timeout'),timeoutMs);request.end();
  });
}
