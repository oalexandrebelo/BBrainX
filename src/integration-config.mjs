import { parseTree, getNodeValue, modify, applyEdits } from 'jsonc-parser';
import { parse as parseToml } from 'smol-toml';
import { ensure, hash } from './primitives.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
// Parsers validate before edits. JSONC edits and TOML managed blocks retain unrelated bytes.
function legacyServer(client,current,server){
  if(!object(current))return false;
  // Configs antigas não tinham `--workspace ... --harness ...` (4 últimos) nem `--recruit`.
  const legacy=client==='kilo'?{...server,command:server.command.filter(a=>a!=='--recruit').slice(0,-4)}:{...server,args:server.args.filter(a=>a!=='--recruit').slice(0,-4)};
  const envKey=client==='kilo'?'environment':'env';
  if(legacy[envKey]?.BBRAINX_RECRUIT==='false'){legacy[envKey]={...legacy[envKey]};delete legacy[envKey].BBRAINX_RECRUIT;}
  if(client==='claude'&&current.type==='stdio')legacy.type='stdio';
  if(client==='codex')for(const key of ['enabled','required','startup_timeout_sec','tool_timeout_sec'])if(Object.hasOwn(current,key)){
    if(key==='enabled'&&current[key]!==true||key==='required'&&current[key]!==false)return false;
    if(key.endsWith('_sec')&&!(Number.isFinite(current[key])&&current[key]>=1&&current[key]<=3600))return false;
    legacy[key]=current[key];
  }
  return hash(current)===hash(legacy);
}
function withoutLegacyToml(text,current){
  let ownTable=false,envTable=false,found=0;const kept=[];
  for(const line of text.match(/[^\n]*\n|[^\n]+$/g)||[]){
    const raw=line.replace(/\r?\n$/,'');
    if(/^\s*\[/.test(raw)){
      ownTable=/^\s*\[mcp_servers\.(?:bbrainx|"bbrainx"|'bbrainx')(?:\.env)?\]\s*$/.test(raw);
      if(ownTable){envTable=/\.env\]/.test(raw);found++;continue;}
    }
    if(ownTable&&raw.trim()&&!/^\s*#/.test(raw)){
      // Old generators used a single assignment per line. Inline/multiline tables,
      // nested extra sections and comment-bearing assignments need manual review.
      const assignment=/^\s*(command|args|enabled|required|startup_timeout_sec|tool_timeout_sec|BBRAINX_HOME)\s*=\s*(.+?)\s*$/.exec(raw);
      ensure(assignment&&envTable===(assignment[1]==='BBRAINX_HOME'),'INTEGRATION_LEGACY_TOML_AMBIGUOUS');
      let value;try{value=JSON.parse(assignment[2]);}catch{ensure(false,'INTEGRATION_LEGACY_TOML_AMBIGUOUS');}
      const expected=envTable?current.env.BBRAINX_HOME:current[assignment[1]];
      ensure(expected!==undefined&&hash(value)===hash(expected),'INTEGRATION_LEGACY_TOML_AMBIGUOUS');
      continue;
    }
    kept.push(line);
  }
  ensure(found===2,'INTEGRATION_LEGACY_TOML_AMBIGUOUS');return kept.join('');
}
export function renderConfig(client,bytes,server,canUpdate,adoptExisting,name='bbrainx'){
  ensure(name==='bbrainx'||name==='ab-s00s','INVALID_INTEGRATION_SERVER');
  adoptExisting=adoptExisting&&name==='bbrainx';
  const text=bytes?bytes.toString('utf8'):'';
  ensure(!bytes||Buffer.from(text).equals(bytes),'INTEGRATION_CONFIG_ENCODING');
  if(client==='codex'){
    let config;try{config=parseToml(text);}catch{ensure(false,'INTEGRATION_TOML_INVALID');}
    ensure(config.mcp_servers===undefined||object(config.mcp_servers),'INTEGRATION_CONFIG_SHAPE');
    const desired=server?{command:server.command,args:server.args,env:server.env}:null,current=config.mcp_servers?.[name];
    if(!server&&current===undefined)return {bytes,adoption:false};
    if(name==='ab-s00s'&&current!==undefined)ensure(canUpdate,'INTEGRATION_SERVER_COLLISION');
    if(server&&object(current))for(const key of ['enabled','required','startup_timeout_sec','tool_timeout_sec'])if(Object.hasOwn(current,key))desired[key]=current[key];
    if(current!==undefined&&hash(current)===hash(desired))return {bytes,adoption:false};
    const adopting=!!server&&!canUpdate&&current!==undefined&&adoptExisting&&legacyServer(client,current,desired);
    if(adopting)for(const key of ['enabled','required','startup_timeout_sec','tool_timeout_sec'])if(Object.hasOwn(current,key))desired[key]=current[key];
    const marker=name==='bbrainx'?'BBRAINX':'AB-S00S';
    const begin='# BEGIN '+marker+' INTEGRATION',end='# END '+marker+' INTEGRATION';
    const start=text.indexOf(begin),finish=text.indexOf(end);
    let remainder=text;
    if(start!==-1||finish!==-1){
      ensure(start!==-1&&finish>start&&text.indexOf(begin,start+begin.length)===-1&&text.indexOf(end,finish+end.length)===-1,'INTEGRATION_MANAGED_BLOCK_INVALID');
      ensure((start===0||text[start-1]==='\n')&&(text[finish+end.length]==='\n'||text[finish+end.length]==='\r'||finish+end.length===text.length),'INTEGRATION_MANAGED_BLOCK_INVALID');
      ensure(canUpdate,'INTEGRATION_SERVER_COLLISION');
      remainder=text.slice(0,start)+text.slice(finish+end.length).replace(/^\r?\n/,'');
      let outside;try{outside=parseToml(remainder);}catch{ensure(false,'INTEGRATION_MANAGED_BLOCK_INVALID');}
      ensure(outside.mcp_servers?.[name]===undefined,'INTEGRATION_SERVER_COLLISION');
      const expected={...config,mcp_servers:{...config.mcp_servers}};delete expected.mcp_servers[name];
      if(!Object.keys(expected.mcp_servers).length&&!outside.mcp_servers)delete expected.mcp_servers;
      ensure(hash(outside)===hash(expected),'INTEGRATION_MANAGED_BLOCK_INVALID');
    }else if(adopting){
      remainder=withoutLegacyToml(text,current);let outside;try{outside=parseToml(remainder);}catch{ensure(false,'INTEGRATION_LEGACY_TOML_AMBIGUOUS');}
      const expected={...config,mcp_servers:{...config.mcp_servers}};delete expected.mcp_servers.bbrainx;
      if(!Object.keys(expected.mcp_servers).length&&!outside.mcp_servers)delete expected.mcp_servers;
      ensure(hash(outside)===hash(expected),'INTEGRATION_LEGACY_TOML_AMBIGUOUS');
    }else ensure(current===undefined,'INTEGRATION_SERVER_COLLISION');
    if(!server)return {bytes:Buffer.from(remainder),adoption:false};
    const eol=text.includes('\r\n')?'\r\n':'\n';
    const block=[begin,'[mcp_servers.'+name+']','command = '+JSON.stringify(server.command),'args = '+JSON.stringify(server.args),
      ...['enabled','required','startup_timeout_sec','tool_timeout_sec'].filter(key=>Object.hasOwn(desired,key)).map(key=>key+' = '+JSON.stringify(desired[key])),
      '','[mcp_servers.'+name+'.env]',...Object.entries(server.env).map(([key,value])=>key+' = '+JSON.stringify(value)),end,''].join(eol);
    const after=remainder+(remainder&&!remainder.endsWith('\n')?eol:'')+block;
    try{parseToml(after);}catch{ensure(false,'INTEGRATION_TOML_INVALID');}return {bytes:Buffer.from(after),adoption:adopting};
  }
  const source=text||'{}',errors=[],tree=parseTree(source,errors,{allowTrailingComma:true,disallowComments:false});
  ensure(tree?.type==='object'&&errors.length===0,'INTEGRATION_JSON_INVALID');
  // Duplicate object keys make collision/ownership ambiguous. Do not repair them.
  const pending=[tree];while(pending.length){const item=pending.pop();if(item.type==='object'){
    const keys=new Set();for(const property of item.children||[]){const key=property.children[0].value;ensure(!keys.has(key),'INTEGRATION_DUPLICATE_JSON_KEY');keys.add(key);}
  }pending.push(...(item.children||[]));}
  const config=getNodeValue(tree),key=client==='kilo'?'mcp':client==='vscode'?'servers':'mcpServers';
  ensure(config[key]===undefined||object(config[key]),'INTEGRATION_CONFIG_SHAPE');
  const current=config[key]?.[name];
  if(!server&&current===undefined)return {bytes,adoption:false};
  if(name==='ab-s00s'&&current!==undefined)ensure(canUpdate,'INTEGRATION_SERVER_COLLISION');
  if(current!==undefined&&hash(current)===hash(server))return {bytes,adoption:false};
  ensure(current===undefined||canUpdate||(adoptExisting&&legacyServer(client,current,server)),'INTEGRATION_SERVER_COLLISION');
  const desired=!server?undefined:client==='claude'&&current?.type==='stdio'?{type:'stdio',...server}:server;
  const edited=applyEdits(source,modify(source,[key,name],desired,{formattingOptions:{insertSpaces:true,tabSize:2,eol:text.includes('\r\n')?'\r\n':'\n'}}));
  return {bytes:Buffer.from(edited+(edited.endsWith('\n')?'':'\n')),adoption:!canUpdate&&current!==undefined&&adoptExisting};
}

