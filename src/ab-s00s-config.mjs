import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensure } from './primitives.mjs';

/** Undefined preserves existing config; null explicitly removes the managed entry. */
export function abS00sServer({abS00s,abS00sBin,userHome=os.homedir(),node,project,home,lane}){
  ensure(abS00s===undefined||abS00s==='on'||abS00s==='off','INVALID_AB_S00S_MODE','Use --ab-s00s on ou --ab-s00s off.');
  ensure(abS00sBin===undefined||abS00s!==undefined,'AB_S00S_MODE_REQUIRED','Use --ab-s00s-bin junto de --ab-s00s on.');
  if(abS00s!=='on')return abS00s==='off'?null:undefined;
  ensure(lane===undefined,'AB_S00S_LANE_UNSUPPORTED','O AB-S00S ainda não recebe a identidade de lane. Ligue-o somente na raiz primária do projeto.');
  const candidate=abS00sBin??path.join(userHome,'.local','bin','ab-s00s');
  ensure(typeof candidate==='string'&&candidate.length<=4096&&path.isAbsolute(candidate)&&!/[\x00-\x1f\x7f]/.test(candidate),'ABSOLUTE_CONFIG_PATH_REQUIRED');
  let entry;
  try{entry=fs.realpathSync.native(candidate);ensure(fs.statSync(entry).isFile(),'AB_S00S_BIN_UNAVAILABLE');}
  catch{ensure(false,'AB_S00S_BIN_UNAVAILABLE','AB-S00S indisponível. Informe --ab-s00s-bin /caminho/bin/ab-s00s.mjs.');}
  ensure(entry.length<=4096&&!/[\x00-\x1f\x7f]/.test(entry),'ABSOLUTE_CONFIG_PATH_REQUIRED');
  return {command:node,args:[entry,'mcp','--project',project],env:{BBRAINX_HOME:home}};
}

/** Agent Canvas canonical MCPConfig: map by name, transport (not the UI's type). */
export function openhandsConfig(server,companion){
  return JSON.stringify({mcp_config:{bbrainx:{transport:'stdio',...server},...(companion?{'ab-s00s':{transport:'stdio',...companion}}:{})}},null,2);
}
