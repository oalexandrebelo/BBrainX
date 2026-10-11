/**
 * Fragmento de configuração do servidor MCP para cada harness. O BBrainX só imprime: quem cola no arquivo
 * ou roda o comando é o usuário. Formatos conferidos na documentação oficial de cada cliente em 04/10/2026
 * (code.claude.com/docs/en/mcp, learn.chatgpt.com/docs/extend/mcp, cursor.com/docs/context/mcp,
 * code.visualstudio.com/docs/copilot/customization/mcp-servers, geminicli.com/docs/tools/mcp-server).
 * Executados como impressos: `claude mcp add` (Claude Code 2.1.263, 04/10/2026) e `codex mcp add` (codex-cli 0.160.0, 05/10/2026).
 * Antigravity e Kilo conferidos em 07/10/2026: antigravity.google/docs/mcp e
 * kilo.ai/docs/automate/mcp/using-in-kilo-code (timeout em milissegundos).
 */
import { ensure, hash } from './primitives.mjs';

export const CLIENTS=Object.freeze(['claude','codex','cursor','vscode','gemini','antigravity','kilo']);
const shell=value=>/^[A-Za-z0-9_\/.:=@+-]+$/.test(value)?value:"'"+value.replaceAll("'","'\\''")+"'";

/**
 * Nome do servidor MCP quando o registro é GLOBAL/de usuário (Codex, Antigravity): o projeto entra no nome, então dois projetos
 * não se sobrescrevem no mesmo arquivo.
 * `codex mcp add` só aceita letras, dígitos, "-" e "_": o que o saneamento altera ganha um sufixo de hash, para que
 * "a.b" e "a-b" não colidam.
 */
export function projectServerName(project){
  const safe=String(project).replace(/[^A-Za-z0-9_-]/g,'-'),kept=safe.slice(0,40);
  return 'bbrainx-'+kept+(kept===project?'':'-'+hash(String(project)).slice(0,6));
}
/**
 * Saída inteira é TOML válido: o que não é TOML (explicação e o comando `codex mcp add`) vai em comentários "#", então
 * ela pode ser anexada a ~/.codex/config.toml. Ou rode o comando comentado, que grava a mesma entrada.
 */
function codexRegistration({node,args,home,project}){
  const name=projectServerName(project),command='codex mcp add '+name+' --env BBRAINX_HOME='+shell(home)+' -- '+[node,...args].map(shell).join(' ');
  return ['# Codex CLI. O registro é GLOBAL: vale para toda sessão do Codex nesta máquina. O nome leva o projeto ('+name+'), então cada projeto tem a sua entrada.',
    '# Opção 1: rode no shell (grava em ~/.codex/config.toml):',
    '#   '+command,
    '# Opção 2: cole o bloco abaixo em ~/.codex/config.toml. Esta saída inteira é TOML válido.',
    '','[mcp_servers.'+name+']','command = '+JSON.stringify(node),'args = '+JSON.stringify(args),'',
    '[mcp_servers.'+name+'.env]','BBRAINX_HOME = '+JSON.stringify(home)].join('\n');
}

export function clientConfig(client,{node,entry,project,home}){
  for(const value of [node,entry,project,home])ensure(typeof value==='string'&&value.length>0&&!/[\u0000-\u001f\u007f]/.test(value),'INVALID_CONFIG_VALUE');
  const args=[entry,'mcp','--project',project], env={BBRAINX_HOME:home}, server={command:node,args,env};
  const json=value=>JSON.stringify(value,null,2);
  if(client==='claude')return '# Claude Code — rode na pasta do projeto (escopo local, só seu); para versionar com a equipe, cole o JSON em .mcp.json\nclaude mcp add bbrainx --env BBRAINX_HOME='+shell(home)+' -- '+[node,...args].map(shell).join(' ')+'\n\n'+json({mcpServers:{bbrainx:server}});
  if(client==='codex')return codexRegistration({node,args,home,project});
  if(client==='cursor')return '# Cursor — cole em .cursor/mcp.json (projeto) ou ~/.cursor/mcp.json\n'+json({mcpServers:{bbrainx:{type:'stdio',...server}}});
  if(client==='vscode')return '# VS Code — cole em .vscode/mcp.json\n'+json({servers:{bbrainx:{type:'stdio',...server}}});
  if(client==='gemini')return '# Gemini CLI — cole em ~/.gemini/settings.json (global; o nome leva o projeto, então cada projeto tem a sua entrada) ou em .gemini/settings.json do projeto\n'+json({mcpServers:{[projectServerName(project)]:server}});
  if(client==='antigravity')return ['# Antigravity (IDE e CLI agy). Escopo de USUÁRIO: mescle esta entrada em ~/.gemini/config/mcp_config.json e preserve os servidores que já existem;',
    '# `agy mcp add` grava nesse mesmo arquivo. O cliente descobre o servidor em todas as janelas, mas ele serve só o projeto indicado em --project; o nome leva o projeto.',
    '# O arquivo de workspace .agents/mcp_config.json não foi descoberto pelo Antigravity IDE 2.5.5 (docs/MAC_MINI_HARNESSES.md).'].join('\n')+'\n'+json({mcpServers:{[projectServerName(project)]:server}});
  if(client==='kilo')return '# Kilo Code — cole em .kilo/kilo.json do projeto; timeout de 60000 ms (60 segundos)\n'+json({mcp:{bbrainx:{type:'local',command:[node,...args],environment:env,enabled:true,timeout:60000}}});
  throw Object.assign(new Error('Cliente desconhecido. Use: '+CLIENTS.join(', ')+'.'),{code:'UNKNOWN_CLIENT'});
}
