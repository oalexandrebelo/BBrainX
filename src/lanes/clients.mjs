import path from 'node:path';
import { ensure, hash } from '../primitives.mjs';

export const LANE_CLIENTS=Object.freeze(['codex','claude','cursor','vscode','gemini','antigravity','antigravity-cli','kilo','opencode-v1','opencode-v2','generic']);
/** Prints one fragment only. Does not set trust, scan global config, add credentials or enable tools. */
export function laneConfig(client,{node,entry,home,binding}){
  ensure(LANE_CLIENTS.includes(client),'UNKNOWN_LANE_CLIENT');
  for(const p of [node,entry,home,binding.root])ensure(typeof p==='string'&&p.length<4096&&(path.isAbsolute(p)||path.win32.isAbsolute(p))&&!/[\x00-\x1f]/.test(p),'ABSOLUTE_CONFIG_PATH_REQUIRED');
  const name='bbrainx-'+hash({project:binding.project,lane:binding.id}).slice(0,16);
  const args=[entry,'mcp','--project',binding.project,'--lane',binding.id,'--workspace',binding.root];
  const env={BBRAINX_HOME:home},server={command:node,args,env};
  let destination,fragment;
  if(client==='codex'){
    destination='.codex/config.toml';
    fragment='[mcp_servers.'+name+']\ncommand = '+JSON.stringify(node)+'\nargs = '+JSON.stringify(args)+'\nenabled = true\nrequired = false\n\n[mcp_servers.'+name+'.env]\nBBRAINX_HOME = '+JSON.stringify(home)+'\n';
  }else if(client==='opencode-v1'||client==='opencode-v2'||client==='kilo'){
    destination=client==='kilo'?'.kilo/kilo.json':'opencode.json';
    const config={type:'local',command:[node,...args],environment:env};
    fragment=client==='opencode-v2'?{mcp:{servers:{[name]:config}}}:{mcp:{[name]:{...config,enabled:true,...(client==='kilo'?{timeout:60000}:{})}}};
  }else if(client==='generic'){
    destination='client-specific';fragment=server;
  }else{
    const locations={claude:'.mcp.json',cursor:'.cursor/mcp.json',vscode:'.vscode/mcp.json',gemini:'.gemini/settings.json',antigravity:'.agents/mcp_config.json','antigravity-cli':'.agents/mcp_config.json'};
    destination=locations[client];
    fragment=client==='vscode'?{servers:{[name]:{type:'stdio',...server}}}:{mcpServers:{[name]:server}};
  }
  return {schemaVersion:1,client,serverName:name,workspace:binding.root,project:binding.project,lane:binding.id,destination,fragment,
    writesConfiguration:false,credentialsChanged:false,clientVersionVerified:null,
    note:'Mescle somente esta entrada na worktree indicada e verifique o cliente real. MCP stdio não é sandbox do shell nem controla a autenticação nativa.'};
}
