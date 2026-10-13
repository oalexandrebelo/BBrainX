import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parse} from 'smol-toml';
import {clientConfig,projectServerName} from '../src/clients.mjs';

const options={node:process.execPath,entry:fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url)),project:'sample.v2',home:path.join(os.tmpdir(),'bbrainx-config-test'),env:{}};
const jsonOf=text=>JSON.parse(text.slice(text.indexOf('{')));

test('Claude desktop config is project-named JSON, usable outside the repository and recruitment is opt-in',()=>{
  const name=projectServerName(options.project),plain=JSON.parse(clientConfig('claude-desktop',options));
  assert.deepEqual(Object.keys(plain.mcpServers),[name]);
  assert(!plain.mcpServers[name].args.includes('--workspace'));
  assert(!plain.mcpServers[name].args.includes('--recruit'));
  assert.deepEqual(plain.mcpServers[name].args,[options.entry,'mcp','--project',options.project,'--harness','claude-desktop']);
  const enabled=JSON.parse(clientConfig('claude-desktop',{...options,recruit:true}));
  assert(enabled.mcpServers[name].args.includes('--recruit'));
  assert.notEqual(name,projectServerName('sample-v2'));
});

test('native runtime overrides survive JSON and TOML generation without provider credentials',()=>{
  const env={BBRAINX_CLAUDE:process.execPath,BBRAINX_CODEX:process.execPath,ANTHROPIC_API_KEY:'DO-NOT-COPY',OPENAI_API_KEY:'DO-NOT-COPY',ANTHROPIC_BASE_URL:'https://not-copied.invalid'};
  const expected={BBRAINX_HOME:options.home,BBRAINX_CLAUDE:process.execPath,BBRAINX_CODEX:process.execPath};
  for(const client of ['claude','claude-desktop','codex','vscode','kilo']){
    const text=clientConfig(client,{...options,recruit:true,env});
    assert(!text.includes('DO-NOT-COPY'));assert(!text.includes('not-copied.invalid'));
    const server=client==='codex'?parse(text).mcp_servers[projectServerName(options.project)]:client==='kilo'?jsonOf(text).mcp.bbrainx:client==='vscode'?jsonOf(text).servers.bbrainx:Object.values(jsonOf(text).mcpServers)[0];
    assert.deepEqual({...server.env??server.environment},expected,client);
    assert((server.args??server.command).includes('--recruit'),client);
  }
  const inactive=JSON.parse(clientConfig('claude-desktop',{...options,env}));
  assert.deepEqual(Object.values(inactive.mcpServers)[0].env,{BBRAINX_HOME:options.home});
});

test('CLI config only prints desktop JSON and leaves user home/state untouched',t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bbx-desktop-config-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const r=spawnSync(process.execPath,[options.entry,'config','--project','sample','--client','claude-desktop','--recruit'],{encoding:'utf8',env:{...process.env,HOME:temp,USERPROFILE:temp,BBRAINX_HOME:path.join(temp,'state'),BBRAINX_CLAUDE:process.execPath,BBRAINX_CODEX:process.execPath}});
  assert.equal(r.status,0,r.stderr);
  const server=JSON.parse(r.stdout).mcpServers['bbrainx-sample'];
  assert(server.args.includes('--recruit'));assert.equal(server.env.BBRAINX_CODEX,process.execPath);
  assert.deepEqual(fs.readdirSync(temp),[]);
});
