import { createHash } from 'node:crypto';
import { EngineError, ERROR_CODES } from './capability.mjs';

/**
 * Servidor MCP próprio sobre stdio: JSON-RPC 2.0, uma mensagem por linha, só a superfície de ferramentas.
 * Não usa o SDK oficial em execução; o cliente oficial continua nos testes como prova de interoperabilidade.
 * A publicação das capacidades como ferramentas segue o modelo do adaptador MCP do Invokta 0.9 (MIT).
 */
export const PROTOCOL_VERSIONS=Object.freeze(['2025-11-25','2025-06-18','2025-03-26','2024-11-05','2024-10-07']);
const PARSE_ERROR=-32700, INVALID_REQUEST=-32600, METHOD_NOT_FOUND=-32601, INVALID_PARAMS=-32602;
const EXECUTION_FAILED=JSON.stringify({code:'EXECUTION_FAILED',message:'Capability execution failed.'});

/** Nome portátil da ferramenta: `context.search` → `context_search`; acima de 64 caracteres, prefixo + hash. */
export function toolName(capabilityId){
  const portable=capabilityId.replace(/[^a-zA-Z0-9_-]/g,'_')||'_';
  if(portable.length<=64)return portable;
  return portable.slice(0,51)+'_'+createHash('sha256').update(capabilityId,'utf8').digest('hex').slice(0,12);
}
const hints=({readOnly,destructive,idempotent,openWorld}={})=>({...(readOnly===undefined?{}:{readOnlyHint:readOnly}),...(destructive===undefined?{}:{destructiveHint:destructive}),...(idempotent===undefined?{}:{idempotentHint:idempotent}),...(openWorld===undefined?{}:{openWorldHint:openWorld})});
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
function failure(error){
  const known=error instanceof EngineError&&ERROR_CODES.includes(error.code);
  const text=known?JSON.stringify({code:error.code,message:error.message,...(error.publicDetails===undefined?{}:{publicDetails:error.publicDetails})}):EXECUTION_FAILED;
  return {isError:true,content:[{type:'text',text}]};
}
const validId=id=>typeof id==='string'||(typeof id==='number'&&Number.isFinite(id));
const rpcError=(id,code,message)=>({jsonrpc:'2.0',id:id??null,error:{code,message}});

/**
 * Trata uma mensagem JSON-RPC já decodificada e devolve a resposta (ou undefined, para notificação).
 * O `principal` vem do host que iniciou o processo; nenhum argumento de ferramenta o altera.
 */
export function createMcpHandler(engine,{principal=null,source='mcp-stdio',instructions}={}){
  const catalog=toolCatalog(engine), running=new Map();
  async function call(id,params){
    if(typeof params?.name!=='string')return rpcError(id,INVALID_PARAMS,'Tool name is required.');
    const capabilityId=catalog.capabilityFor(params.name);
    if(capabilityId===undefined)return rpcError(id,INVALID_PARAMS,'Tool '+params.name+' not found');
    const args=params.arguments??{};
    if(typeof args!=='object'||Array.isArray(args))return rpcError(id,INVALID_PARAMS,'Tool arguments must be an object.');
    const controller=new AbortController();running.set(id,controller);
    try{
      const structuredContent=await engine.invoke(capabilityId,args,{principal,source,signal:controller.signal});
      return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(structuredContent)}],structuredContent}};
    }catch(error){return {jsonrpc:'2.0',id,result:failure(error)};}
    finally{running.delete(id);}
  }
  async function handle(message){
    if(typeof message!=='object'||message===null||Array.isArray(message)||message.jsonrpc!=='2.0')return rpcError(validId(message?.id)?message.id:null,INVALID_REQUEST,'Invalid JSON-RPC message.');
    const {id,method,params}=message;
    if(typeof method!=='string')return 'result' in message||'error' in message?undefined:rpcError(validId(id)?id:null,INVALID_REQUEST,'Invalid JSON-RPC message.');
    if(id===undefined){
      if(method==='notifications/cancelled')running.get(params?.requestId)?.abort(new Error('Cancelled by the client.'));
      return undefined;
    }
    if(!validId(id))return rpcError(null,INVALID_REQUEST,'Request id must be a string or a number.');
    if(method==='initialize'){
      const protocolVersion=PROTOCOL_VERSIONS.includes(params?.protocolVersion)?params.protocolVersion:PROTOCOL_VERSIONS[0];
      return {jsonrpc:'2.0',id,result:{protocolVersion,capabilities:{tools:{}},serverInfo:{name:engine.name,version:engine.version},...(instructions?{instructions}:{})}};
    }
    if(method==='ping')return {jsonrpc:'2.0',id,result:{}};
    if(method==='tools/list')return {jsonrpc:'2.0',id,result:{tools:catalog.tools}};
    if(method==='tools/call')return call(id,params);
    return rpcError(id,METHOD_NOT_FOUND,'Method not found: '+method);
  }
  return {handle,cancelAll(){for(const controller of running.values())controller.abort(new Error('Server is closing.'));}};
}

/**
 * Serve até a entrada fechar. Linha maior que `maxLineBytes` encerra o servidor com erro: é o limite contra
 * um cliente que nunca envia a quebra de linha. A saída padrão só recebe mensagens do protocolo.
 */
export async function serveMcpStdio(engine,{principal=null,maxLineBytes=1048576,input=process.stdin,output=process.stdout,instructions}={}){
  if(!Number.isSafeInteger(maxLineBytes)||maxLineBytes<=0)throw new TypeError('maxLineBytes must be a positive safe integer.');
  const handler=createMcpHandler(engine,{principal,instructions}), pending=new Set();
  let buffered=[],bufferedBytes=0,closed=false,fail;
  const send=message=>{if(!closed&&message!==undefined&&!(Array.isArray(message)&&!message.length))output.write(JSON.stringify(message)+'\n');};
  async function receive(line){
    let message;
    try{message=JSON.parse(line);}catch{return send(rpcError(null,PARSE_ERROR,'Parse error.'));}
    if(!Array.isArray(message))return send(await handler.handle(message));
    if(!message.length)return send(rpcError(null,INVALID_REQUEST,'Empty batch.'));
    send((await Promise.all(message.map(item=>handler.handle(item)))).filter(response=>response!==undefined));
  }
  function dispatch(bytes){
    const line=bytes.toString('utf8').replace(/\r$/,'');if(!line.trim())return;
    const work=receive(line).catch(()=>{}).finally(()=>pending.delete(work));pending.add(work);
  }
  await new Promise(resolve=>{
    const end=error=>{fail??=error;input.off('data',onData);resolve();};
    function onData(chunk){
      let start=0;
      for(let newline=chunk.indexOf(10,start);newline!==-1;newline=chunk.indexOf(10,start)){
        buffered.push(chunk.subarray(start,newline));dispatch(Buffer.concat(buffered));buffered=[];bufferedBytes=0;start=newline+1;
      }
      if(start<chunk.length){buffered.push(chunk.subarray(start));bufferedBytes+=chunk.length-start;}
      if(bufferedBytes>maxLineBytes)end(new Error('The MCP stdio read buffer exceeded the configured limit of '+maxLineBytes+' bytes.'));
    }
    input.on('data',onData);input.once('end',()=>end());input.once('close',()=>end());
    output.on('error',error=>{closed=true;handler.cancelAll();end(error.code==='EPIPE'?undefined:error);});
  });
  if(fail){closed=true;handler.cancelAll();input.destroy?.();throw fail;}
  await Promise.allSettled([...pending]);closed=true;
}
