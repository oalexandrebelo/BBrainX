import path from 'node:path';
import {ensure,identifier} from './primitives.mjs';
/** Gera configuração; não escreve arquivos, amplia confiança ou modifica o Codex. A raiz vem do registro do host. */
export function codexProjectConfig({root,node,entry,project,home}) {
  identifier(project);
  for(const value of [root,node,entry,home]) ensure(typeof value==='string' && value.length>0 && value.length<=4096 && !/[\x00-\x1f\x7f]/.test(value) && (path.posix.isAbsolute(value)||path.win32.isAbsolute(value)), 'ABSOLUTE_CONFIG_PATH_REQUIRED');
  const paths=path.win32.isAbsolute(root)&&!path.posix.isAbsolute(root)?path.win32:path.posix;
  const name='bbrainx-'+project;
  // Aspas na chave preservam pontos no ID; chave TOML sem aspas criaria outra tabela.
  const section='mcp_servers.'+JSON.stringify(name);
  const text=['# Projeto autorizado: '+project,'# Cole somente em um projeto confiável; nenhum arquivo é modificado por este gerador.',
    '['+section+']','command = '+JSON.stringify(node),'args = '+JSON.stringify([entry,'mcp','--project',project]),
    'enabled = true','required = false','startup_timeout_sec = 10','tool_timeout_sec = 60','',
    '['+section+'.env]','BBRAINX_HOME = '+JSON.stringify(home),''].join('\n');
  return {scope:'project',project,root,target:paths.join(root,'.codex','config.toml'),serverName:name,text,
    writesConfiguration:false,expandsTrust:false,
    warning:'O catálogo local do Codex depende da confiança e da raiz escolhida. Renomear servidor não é autorização. Preserve outras seções e valide uma chamada real.'};
}
