/**
 * Fragmento de configuração do servidor MCP para cada harness. O BBrainX só imprime: quem cola no arquivo
 * ou roda o comando é o usuário. Formatos conferidos na documentação de cada cliente em 04/10/2026.
 */
export const CLIENTS=Object.freeze(['claude','codex','cursor','vscode','gemini']);
const shell=value=>/^[A-Za-z0-9_\/.:=@+-]+$/.test(value)?value:"'"+value.replaceAll("'","'\\''")+"'";

export function clientConfig(client,{node,entry,project,home}){
  const args=[entry,'mcp','--project',project], env={BBRAINX_HOME:home}, server={command:node,args,env};
  const json=value=>JSON.stringify(value,null,2);
  if(client==='claude')return '# Claude Code — rode na pasta do projeto, ou cole o JSON em .mcp.json\nclaude mcp add bbrainx --env BBRAINX_HOME='+shell(home)+' -- '+[node,...args].map(shell).join(' ')+'\n\n'+json({mcpServers:{bbrainx:server}});
  if(client==='codex')return '# Codex CLI — cole em ~/.codex/config.toml\n[mcp_servers.bbrainx]\ncommand = '+JSON.stringify(node)+'\nargs = '+JSON.stringify(args)+'\n\n[mcp_servers.bbrainx.env]\nBBRAINX_HOME = '+JSON.stringify(home);
  if(client==='cursor')return '# Cursor — cole em .cursor/mcp.json (projeto) ou ~/.cursor/mcp.json\n'+json({mcpServers:{bbrainx:server}});
  if(client==='vscode')return '# VS Code — cole em .vscode/mcp.json\n'+json({servers:{bbrainx:{type:'stdio',...server}}});
  if(client==='gemini')return '# Gemini CLI — cole em ~/.gemini/settings.json (ou .gemini/settings.json do projeto)\n'+json({mcpServers:{bbrainx:server}});
  throw Object.assign(new Error('Cliente desconhecido. Use: '+CLIENTS.join(', ')+'.'),{code:'UNKNOWN_CLIENT'});
}
