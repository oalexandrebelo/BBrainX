import { createHash } from 'node:crypto';
import { EngineError, ERROR_CODES } from './capability.mjs';
import { performance } from 'node:perf_hooks';
import { McpRateWindow, positiveLimit } from './mcp-flow.mjs';
import { serveBoundedStdio, validMcpRequestId } from './mcp-transport.mjs';

/**
 * Servidor MCP próprio sobre stdio: JSON-RPC 2.0, uma mensagem por linha, só a superfície de ferramentas.
 * Fala as duas eras do protocolo no mesmo processo:
 *  - moderna (2026-07-28): sem handshake; cada requisição traz versão e capacidades do cliente em `_meta`;
 *  - legada (2025-11-25 e anteriores): sessão aberta por `initialize`.
 * Não usa o SDK oficial em execução; o cliente oficial continua nos testes como prova de interoperabilidade.
 * A publicação das capacidades como ferramentas segue o modelo do adaptador MCP do Invokta 0.9 (MIT).
 */
export const MODERN_VERSIONS=Object.freeze(['2026-07-28']);
export const LEGACY_VERSIONS=Object.freeze(['2025-11-25','2025-06-18','2025-03-26','2024-11-05']);
export const PROTOCOL_VERSIONS=Object.freeze([...MODERN_VERSIONS,...LEGACY_VERSIONS]);
const META='io.modelcontextprotocol/';
const PARSE_ERROR=-32700, INVALID_REQUEST=-32600, METHOD_NOT_FOUND=-32601, INVALID_PARAMS=-32602, UNSUPPORTED_VERSION=-32022;
// A lista de ferramentas é a mesma para todo chamador e só muda com a versão do programa.
const CACHE={ttlMs:300000,cacheScope:'public'};
const EXECUTION_FAILED=JSON.stringify({code:'EXECUTION_FAILED',message:'Capability execution failed.'});

/** Nome portátil da ferramenta: `context.search` → `context_search`; acima de 64 caracteres, prefixo + hash. */
export function toolName(capabilityId){
  const portable=capabilityId.replace(/[^a-zA-Z0-9_-]/g,'_')||'_';
  if(portable.length<=64)return portable;
  return portable.slice(0,51)+'_'+createHash('sha256').update(capabilityId,'utf8').digest('hex').slice(0,12);
}
const hints=({readOnly,destructive,idempotent,openWorld}={})=>({...(readOnly===undefined?{}:{readOnlyHint:readOnly}),...(destructive===undefined?{}:{destructiveHint:destructive}),...(idempotent===undefined?{}:{idempotentHint:idempotent}),...(openWorld===undefined?{}:{openWorldHint:openWorld})});
/** Ferramentas na ordem em que as capacidades foram declaradas: ordem estável ajuda o cache do cliente e do modelo. */
export function toolCatalog(engine){
  const byName=new Map();
  const tools=engine.list().map(({id})=>{
    const name=toolName(id), description=engine.describe(id);
    if(byName.has(name))throw new TypeError('Capabilities '+JSON.stringify(byName.get(name))+' and '+JSON.stringify(id)+' resolve to the same MCP tool name '+JSON.stringify(name)+'.');
    byName.set(name,id);
    return {name,description:description.description,inputSchema:description.inputSchema,outputSchema:description.outputSchema,...(description.title===undefined?{}:{title:description.title}),...(description.annotations===undefined?{}:{annotations:hints(description.annotations)})};
  });
  return {tools,capabilityFor:name=>byName.get(name)};
}
const refusal=body=>({isError:true,content:[{type:'text',text:typeof body==='string'?body:JSON.stringify(body)}]});
function failure(error){
  const known=error instanceof EngineError&&ERROR_CODES.includes(error.code);
  return refusal(known?{code:error.code,message:error.message,...(error.publicDetails===undefined?{}:{publicDetails:error.publicDetails})}:EXECUTION_FAILED);
}
const validId=validMcpRequestId;
const plainObject=value=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const rpcError=(id,code,message,data)=>({jsonrpc:'2.0',id:id??null,error:{code,message,...(data===undefined?{}:{data})}});

/**
 * Trata uma mensagem JSON-RPC já decodificada e devolve a resposta (ou undefined, quando não há o que responder).
 * O `principal` vem do host que iniciou o processo; nenhum argumento de ferramenta o altera.
 * `isFailure` diz quando um resultado válido representa uma recusa do domínio: ela segue com `isError`.
 * `rateLimit` é o teto de chamadas de ferramenta por janela, contra um agente em laço.
 */
export function createMcpHandler(engine,{principal=null,source='mcp-stdio',instructions,isFailure,rateLimit={calls:300,perMs:60000},now=()=>performance.now(),maxInFlightCalls=8}={}){
  const catalog=toolCatalog(engine), running=new Map(), serverInfo={name:engine.name,version:engine.version};
  const quota=new McpRateWindow({...rateLimit,now});
  positiveLimit(maxInFlightCalls,'maxInFlightCalls',128);
  principal=structuredClone(principal);
  let peakRunning=0,admitted=0,busy=0,limited=0,cancelled=0;
  function allowed(){return quota.take();}
  async function call(id,params,reply){
    if(typeof params?.name!=='string')return rpcError(id,INVALID_PARAMS,'Tool name is required.');
    const capabilityId=catalog.capabilityFor(params.name);
    if(capabilityId===undefined)return rpcError(id,INVALID_PARAMS,'Unknown tool: '+params.name);
    const args=params.arguments??{};
    if(!plainObject(args))return rpcError(id,INVALID_PARAMS,'Tool arguments must be an object.');
    if(running.has(id))return rpcError(id,INVALID_REQUEST,'Request id is already active.');
    if(running.size>=maxInFlightCalls){busy++;return reply(refusal({code:'MCP_BUSY',message:'Concurrent tool-call limit reached. Wait for a prior operation to settle.'}));}
    if(!allowed()){limited++;return reply(refusal({code:'RATE_LIMITED',message:'More than '+rateLimit.calls+' tool calls in '+Math.round(rateLimit.perMs/1000)+' s. Wait and try again.'}));}
    const entry={controller:new AbortController(),cancelled:false};running.set(id,entry);admitted++;peakRunning=Math.max(peakRunning,running.size);
    try{
      const structuredContent=await engine.invoke(capabilityId,args,{principal,source,signal:entry.controller.signal});
      // Requisição cancelada pelo cliente não recebe mais nenhuma mensagem.
      if(entry.cancelled)return undefined;
      return reply({content:[{type:'text',text:JSON.stringify(structuredContent)}],structuredContent,...(isFailure?.(structuredContent)===true?{isError:true}:{})});
    }catch(error){return entry.cancelled?undefined:reply(failure(error));}
    finally{if(running.get(id)===entry)running.delete(id);}
  }
  function modern(id,method,params,meta){
    const version=meta[META+'protocolVersion'];
    if(typeof version!=='string'||!plainObject(meta[META+'clientCapabilities']))return rpcError(id,INVALID_PARAMS,'Request _meta needs '+META+'protocolVersion and '+META+'clientCapabilities.');
    if(!MODERN_VERSIONS.includes(version))return rpcError(id,UNSUPPORTED_VERSION,'Unsupported protocol version',{supported:[...PROTOCOL_VERSIONS],requested:version});
    const complete=result=>({jsonrpc:'2.0',id,result:{resultType:'complete',...result,_meta:{[META+'serverInfo']:serverInfo}}});
    if(method==='server/discover')return complete({supportedVersions:[...PROTOCOL_VERSIONS],capabilities:{tools:{}},...(instructions?{instructions}:{}),...CACHE});
    if(method==='tools/list')return complete({tools:catalog.tools,...CACHE});
    if(method==='tools/call')return call(id,params,complete);
    return rpcError(id,METHOD_NOT_FOUND,'Method not found: '+method);
  }
  function legacy(id,method,params){
    const result=value=>({jsonrpc:'2.0',id,result:value});
    if(method==='initialize'){
      const protocolVersion=LEGACY_VERSIONS.includes(params?.protocolVersion)?params.protocolVersion:LEGACY_VERSIONS[0];
      return result({protocolVersion,capabilities:{tools:{}},serverInfo,...(instructions?{instructions}:{})});
    }
    if(method==='ping')return result({});
    if(method==='tools/list')return result({tools:catalog.tools});
    if(method==='tools/call')return call(id,params,result);
    if(method==='server/discover')return rpcError(id,INVALID_PARAMS,'server/discover needs '+META+'protocolVersion and '+META+'clientCapabilities in _meta.');
    return rpcError(id,METHOD_NOT_FOUND,'Method not found: '+method);
  }
  async function handle(message){
    if(!plainObject(message)||message.jsonrpc!=='2.0')return rpcError(validId(message?.id)?message.id:null,INVALID_REQUEST,'Invalid JSON-RPC message.');
    const {id,method,params}=message;
    if(typeof method!=='string')return 'result' in message||'error' in message?undefined:rpcError(validId(id)?id:null,INVALID_REQUEST,'Invalid JSON-RPC message.');
    if(id===undefined){
      if(method==='notifications/cancelled'){const entry=running.get(params?.requestId);if(entry&&!entry.cancelled){entry.cancelled=true;cancelled++;entry.controller.abort(new Error('Cancelled by the client.'));}}
      return undefined;
    }
    if(!validId(id))return rpcError(null,INVALID_REQUEST,'Request id must be a string or an integer.');
    // A era é escolhida por requisição: metadados modernos em `_meta`, ou a semântica legada aberta por `initialize`.
    const meta=plainObject(params)&&plainObject(params._meta)?params._meta:null;
    return meta&&META+'protocolVersion' in meta?modern(id,method,params,meta):legacy(id,method,params);
  }
  return {handle,stats:()=>({running:running.size,peakRunning,admitted,busy,limited,cancelled,maxInFlightCalls,rate:quota.stats(),scope:'handler-invocations-not-physical-work'}),cancelAll(){for(const entry of running.values()){entry.cancelled=true;entry.controller.abort(new Error('Server is closing.'));}}};
}

/** Transporte com correlação e quotas por conexão. EOF solicita cancelamento e
 * aguarda somente shutdownMs; não promete preemptar trabalho síncrono do domínio.
 * Limites vêm do host, nunca de argumentos de ferramenta. Ver docs/MCP_TRANSPORT.md.
 */
export function serveMcpStdio(engine,options={}){
  return serveBoundedStdio(createMcpHandler(engine,options),options);
}
