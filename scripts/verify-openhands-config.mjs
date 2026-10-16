/** Prova opt-in contra a referência local fixada; não instala nem inicia o Agent Canvas. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { clientConfig } from '../src/clients.mjs';
import { hash } from '../src/primitives.mjs';

const reference=process.argv[2];
assert(reference&&path.isAbsolute(reference),'Informe o caminho absoluto da referência OpenHands.');
const pinned={
  'src/utils/mcp-config.ts':'5f4c02bf87986795fd3ddb6aa681c26dce781ababc5d78e972ed6ee8e49df48d',
  'src/types/mcp-server.ts':'1e94f597b4221f23e9963fd2d390313809d9094282a8dd6eed3fa1bb538be278',
  'src/types/settings.ts':'a2188626aa67230688e8ed0d769251049c2cd750ccc18a477e3520006f014af5'
};
const sources={};
for(const [file,sha] of Object.entries(pinned)){
  sources[file]=fs.readFileSync(path.join(reference,file),'utf8');
  assert.equal(hash(sources[file]),sha,'Referência mudou; revise o contrato antes de atualizar o hash: '+file);
}
// Executa somente os normalizadores stdio reais. Imports/autenticação e código de
// patches ficam fora desta prova; nenhum arquivo da referência é modificado ou copiado.
const source=sources['src/utils/mcp-config.ts'];
const code=stripTypeScriptTypes(source.slice(source.indexOf('export const REDACTED_MCP_SECRET_VALUE'),source.indexOf('const buildEnabledPatch'))).replace(/\bexport /g,'');
const api=vm.runInNewContext(code+'\n({parseMcpConfig,toCanonicalMcpServer})',{}, {timeout:1000});
const here=fileURLToPath(import.meta.url),entry=fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url));
const options={node:process.execPath,entry,project:'prova-openhands',home:path.dirname(here)};
const plain=value=>JSON.parse(JSON.stringify(value));
for(const abS00s of [undefined,'off','on']){
  // O próprio script é um caminho de fixture válido; nunca é executado como MCP.
  const config=JSON.parse(clientConfig('openhands',{...options,abS00s,...(abS00s==='on'?{abS00sBin:here}:{})})).mcp_config;
  assert.deepEqual(plain(api.parseMcpConfig(config)),config);
  for(const [id,{transport,...server}] of Object.entries(config)){
    assert.equal(transport,'stdio');
    assert.deepEqual(plain(api.toCanonicalMcpServer({id,type:'stdio',...server})),config[id]);
  }
}
console.log(JSON.stringify({ok:true,referenceRevision:'0c7c2258a8acc309852ceb248b3ade606b79869c',modes:['ausente','off','on'],checks:['parseMcpConfig','toCanonicalMcpServer'],sourceHashes:pinned},null,2));
