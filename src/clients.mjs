/**
 * Fragmento de configuração do servidor MCP para cada harness. O BBrainX só imprime: quem cola no arquivo
 * ou roda o comando é o usuário. Formatos conferidos na documentação oficial de cada cliente em 04/10/2026
 * (code.claude.com/docs/en/mcp, learn.chatgpt.com/docs/extend/mcp, cursor.com/docs/context/mcp,
 * code.visualstudio.com/docs/copilot/customization/mcp-servers, geminicli.com/docs/tools/mcp-server).
 * Executados como impressos: `claude mcp add` (Claude Code 2.1.263, 04/10/2026) e `codex mcp add` (codex-cli 0.160.0, 05/10/2026).
 * Antigravity e Kilo conferidos em 07/10/2026: antigravity.google/docs/mcp e
 * kilo.ai/docs/automate/mcp/using-in-kilo-code (timeout em milissegundos).
 */
export const CLIENTS=Object.freeze(['claude','codex','cursor','vscode','gemini','antigravity','kilo']);
const shell=value=>/^[A-Za-z0-9_\/.:=@+-]+$/.test(value)?value:"'"+value.replaceAll("'","'\\''")+"'";

export function clientConfig(client,{node,entry,project,home}){
  const args=[entry,'mcp','--project',project], env={BBRAINX_HOME:home}, server={command:node,args,env};
  const json=value=>JSON.stringify(value,null,2);
  if(client==='claude')return '# Claude Code — rode na pasta do projeto (escopo local, só seu); para versionar com a equipe, cole o JSON em .mcp.json\nclaude mcp add bbrainx --env BBRAINX_HOME='+shell(home)+' -- '+[node,...args].map(shell).join(' ')+'\n\n'+json({mcpServers:{bbrainx:server}});
  if(client==='codex')return '# Codex CLI — o registro é global (vale para toda sessão desta máquina): rode o comando, ou cole o bloco em ~/.codex/config.toml\n# Com mais de um projeto na máquina, registre cada um com o projeto no nome (bbrainx-'+project+').\ncodex mcp add bbrainx --env BBRAINX_HOME='+shell(home)+' -- '+[node,...args].map(shell).join(' ')+'\n\n[mcp_servers.bbrainx]\ncommand = '+JSON.stringify(node)+'\nargs = '+JSON.stringify(args)+'\n\n[mcp_servers.bbrainx.env]\nBBRAINX_HOME = '+JSON.stringify(home);
  if(client==='cursor')return '# Cursor — cole em .cursor/mcp.json (projeto) ou ~/.cursor/mcp.json\n'+json({mcpServers:{bbrainx:{type:'stdio',...server}}});
  if(client==='vscode')return '# VS Code — cole em .vscode/mcp.json\n'+json({servers:{bbrainx:{type:'stdio',...server}}});
  if(client==='gemini')return '# Gemini CLI — cole em ~/.gemini/settings.json (ou .gemini/settings.json do projeto)\n'+json({mcpServers:{bbrainx:server}});
  if(client==='antigravity')return '# Antigravity — cole em .agents/mcp_config.json do projeto\n'+json({mcpServers:{bbrainx:server}});
  if(client==='kilo')return '# Kilo Code — cole em .kilo/kilo.json do projeto; timeout de 60000 ms (60 segundos)\n'+json({mcp:{bbrainx:{type:'local',command:[node,...args],environment:env,enabled:true,timeout:60000}}});
  throw Object.assign(new Error('Cliente desconhecido. Use: '+CLIENTS.join(', ')+'.'),{code:'UNKNOWN_CLIENT'});
}
