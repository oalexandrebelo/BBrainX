import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse as toml } from 'smol-toml';
import { parse as jsonc } from 'jsonc-parser';
import { z } from 'zod';
import { clientConfig, CLIENTS } from '../src/clients.mjs';
import { planIntegrations, applyIntegrationPlan, rollbackIntegration } from '../src/integrations.mjs';

const cli=fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url));
const targets={claude:'.mcp.json',codex:'.codex/config.toml',vscode:'.vscode/mcp.json'};
const servers=(client,text)=>client==='codex'?toml(text).mcp_servers:jsonc(text)[client==='vscode'?'servers':'mcpServers'];
function fixture(t){
  const dir=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-ab-s00s-')));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const root=path.join(dir,'project'),home=path.join(dir,'state'),userHome=path.join(dir,'user'),bin=path.join(dir,'AB S00S','bin','ab-s00s.mjs');
  for(const p of [root,userHome,path.dirname(bin)])fs.mkdirSync(p,{recursive:true});
  fs.writeFileSync(bin,'throw new Error("config must never execute this file");\n');
  const options={root,home,userHome,platform:'linux',project:'app',node:process.execPath,entry:cli,clients:Object.keys(targets),env:{PATH:''},abS00sBin:bin};
  const read=client=>fs.readFileSync(path.join(root,targets[client]),'utf8');
  return {dir,root,home,userHome,bin,options,read};
}

for(const client of Object.keys(targets))test(`AB-S00S ${client}: on/off are idempotent, preserve peers and rollback exact bytes`,t=>{
  const f=fixture(t),target=path.join(f.root,targets[client]);fs.mkdirSync(path.dirname(target),{recursive:true});
  const before=client==='codex'?'# keep\nmodel = "local"\n[mcp_servers.peer]\ncommand = "peer"\n':'{\n // keep\n "'+(client==='vscode'?'servers':'mcpServers')+'": {"peer":{"command":"peer"}}, "trust": false\n}\n';
  fs.writeFileSync(target,before);
  const options={...f.options,clients:[client],abS00s:'on'},plan=planIntegrations(options);
  assert.equal(f.read(client),before);assert.equal(fs.existsSync(f.home),false);
  const on=applyIntegrationPlan(plan),enabled=f.read(client),entries=servers(client,enabled);
  assert.deepEqual(entries['ab-s00s'].args,[f.bin,'mcp','--project','app']);
  assert.equal(entries['ab-s00s'].command,process.execPath);assert.equal(entries['ab-s00s'].env.BBRAINX_HOME,f.home);
  assert.equal(entries.peer.command,'peer');assert(entries.bbrainx);assert(enabled.includes('keep'));
  assert.equal(applyIntegrationPlan(planIntegrations(options)).status,'unchanged');
  // No flag leaves the second entry untouched, even when BBrainX itself is updated.
  const {abS00sBin,...legacy}=f.options;
  const intermediate=applyIntegrationPlan(planIntegrations({...legacy,clients:[client],recruit:true}));
  assert.deepEqual(servers(client,f.read(client))['ab-s00s'],entries['ab-s00s']);
  const priorOff=f.read(client),offOptions={...legacy,clients:[client],recruit:true,abS00s:'off'};
  fs.unlinkSync(f.bin); // disabling must work after AB-S00S was uninstalled
  const off=applyIntegrationPlan(planIntegrations(offOptions));
  assert.equal(servers(client,f.read(client))['ab-s00s'],undefined);assert(servers(client,f.read(client)).bbrainx);
  assert.equal(applyIntegrationPlan(planIntegrations(offOptions)).status,'unchanged');
  rollbackIntegration({home:f.home,id:off.id});assert.equal(f.read(client),priorOff);
  // Restore the intermediate BBrainX update before rolling the initial receipt back.
  rollbackIntegration({home:f.home,id:intermediate.id});assert.equal(f.read(client),enabled);rollbackIntegration({home:f.home,id:on.id});assert.equal(f.read(client),before);
});

for(const client of Object.keys(targets))test(`AB-S00S ${client}: foreign entry is never adopted or removed by a BBrainX receipt`,t=>{
  const f=fixture(t),target=path.join(f.root,targets[client]);fs.mkdirSync(path.dirname(target),{recursive:true});
  const before=client==='codex'?'[mcp_servers.ab-s00s]\ncommand = "foreign"\n':JSON.stringify({[client==='vscode'?'servers':'mcpServers']:{'ab-s00s':{command:'foreign'}}});
  fs.writeFileSync(target,before);const {abS00sBin,...legacy}=f.options;
  applyIntegrationPlan(planIntegrations({...legacy,clients:[client]}));
  const saved=f.read(client);
  for(const mode of ['on','off']){
    const plan=planIntegrations({...f.options,clients:[client],abS00s:mode,adoptExisting:true});
    assert.equal(plan.files[0].reason,'INTEGRATION_SERVER_COLLISION');assert.throws(()=>applyIntegrationPlan(plan),{code:'INTEGRATION_PLAN_BLOCKED'});
    assert.equal(f.read(client),saved);
  }
});

test('AB-S00S: one receipt covers all three files; concurrent edits and corrupt backups fail closed',t=>{
  const f=fixture(t),base=applyIntegrationPlan(planIntegrations({...f.options,abS00s:'on'}));
  assert.equal(base.files.length,3);
  const plan=planIntegrations({...f.options,abS00s:'off'}),target=path.join(f.root,targets.vscode),before=f.read('vscode');
  fs.appendFileSync(target,'\n ');
  assert.throws(()=>applyIntegrationPlan(plan),{code:'INTEGRATION_CONFIG_CHANGED'});
  assert.throws(()=>rollbackIntegration({home:f.home,id:base.id}),{code:'INTEGRATION_ROLLBACK_CHANGED'});
  assert(servers('claude',f.read('claude'))['ab-s00s']);
  fs.writeFileSync(target,before);
  const off=applyIntegrationPlan(planIntegrations({...f.options,abS00s:'off'}));
  const directory=path.join(f.home,'integrations',off.id),receipt=JSON.parse(fs.readFileSync(path.join(directory,'receipt.json')));
  fs.writeFileSync(path.join(directory,receipt.files[0].backup),'corrupted');
  assert.throws(()=>rollbackIntegration({home:f.home,id:off.id}),{code:'INTEGRATION_BACKUP_INVALID'});
});

test('AB-S00S: partial apply restores all original files through the same prepared receipt',t=>{
  const f=fixture(t),originals=new Map();
  for(const [client,relative] of Object.entries(targets)){
    const target=path.join(f.root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
    const bytes=client==='codex'?'# original\n':'{}\n';fs.writeFileSync(target,bytes);originals.set(target,bytes);
  }
  const plan=planIntegrations({...f.options,abS00s:'on'}),rename=fs.renameSync;let injected=false;
  fs.renameSync=(source,target)=>{if(target===path.join(f.root,targets.codex)&&!injected){injected=true;throw Object.assign(new Error('falha simulada'),{code:'EIO'});}return rename(source,target);};
  try{assert.throws(()=>applyIntegrationPlan(plan),{code:'EIO'});}finally{fs.renameSync=rename;}
  assert(injected);for(const [target,bytes] of originals)assert.equal(fs.readFileSync(target,'utf8'),bytes);
  const records=fs.readdirSync(path.join(f.home,'integrations'));assert.equal(records.length,1);
  const receipt=JSON.parse(fs.readFileSync(path.join(f.home,'integrations',records[0],'receipt.json')));assert.equal(receipt.status,'rolled-back');assert.equal(receipt.files.length,3);
});

test('AB-S00S: default launcher resolves realpath; invalid modes and unavailable binaries refuse without writes',t=>{
  const f=fixture(t),launcher=path.join(f.userHome,'.local','bin','ab-s00s');fs.mkdirSync(path.dirname(launcher),{recursive:true});fs.symlinkSync(f.bin,launcher,'file');
  const {abS00sBin,...options}=f.options;
  applyIntegrationPlan(planIntegrations({...options,abS00s:'on'}));
  assert.equal(servers('claude',f.read('claude'))['ab-s00s'].args[0],f.bin);
  assert.throws(()=>planIntegrations({...options,abS00s:'yes'}),{code:'INVALID_AB_S00S_MODE'});
  assert.throws(()=>planIntegrations({...options,abS00s:'on',abS00sBin:'relative'}),{code:'ABSOLUTE_CONFIG_PATH_REQUIRED'});
  fs.unlinkSync(f.bin);assert.throws(()=>planIntegrations({...options,abS00s:'on'}),{code:'AB_S00S_BIN_UNAVAILABLE'});
});

test('AB-S00S: lane activation refuses before effects; off and flag omission keep lane support',t=>{
  const f=fixture(t);
  assert.throws(()=>planIntegrations({...f.options,lane:'recruit-1',abS00s:'on'}),{code:'AB_S00S_LANE_UNSUPPORTED'});
  assert.equal(fs.existsSync(f.home),false);assert.deepEqual(fs.readdirSync(f.root),[]);
  const {abS00sBin,...options}=f.options;
  applyIntegrationPlan(planIntegrations({...options,lane:'recruit-1'}));
  assert.equal(applyIntegrationPlan(planIntegrations({...options,lane:'recruit-1',abS00s:'off'})).status,'unchanged');
  assert(servers('claude',f.read('claude')).bbrainx.args.includes('recruit-1'));
});

// Agent Canvas 0c7c225: MCPServerConfig (src/types/mcp-server.ts) is the UI model
// with type=stdio. toCanonicalMcpServer/parseMcpConfig (src/utils/mcp-config.ts)
// persist a name-keyed map with transport=stdio in AgentSettings.mcp_config.
const stdio=z.object({transport:z.literal('stdio'),command:z.string().min(1),args:z.array(z.string()),env:z.record(z.string(),z.string())}).strict();
const agentSettings=z.object({mcp_config:z.record(z.string(),stdio)}).strict();
test('OpenHands: pure JSON matches the Agent Canvas canonical stdio type, with AB-S00S opt-in',t=>{
  const f=fixture(t),{abS00sBin,...options}=f.options;
  assert(CLIENTS.includes('openhands'));
  const plain=agentSettings.parse(JSON.parse(clientConfig('openhands',options)));
  assert.deepEqual(Object.keys(plain.mcp_config),['bbrainx']);
  assert.deepEqual(plain.mcp_config.bbrainx,{transport:'stdio',command:process.execPath,args:[cli,'mcp','--project','app'],env:{BBRAINX_HOME:f.home}});
  const both=agentSettings.parse(JSON.parse(clientConfig('openhands',{...f.options,abS00s:'on'})));
  assert.deepEqual(both.mcp_config['ab-s00s'].args,[f.bin,'mcp','--project','app']);
  assert.deepEqual(JSON.parse(clientConfig('openhands',{...options,abS00s:'off'})),plain);
  assert.equal(fs.existsSync(f.home),false);
});

test('CLI: integrate --ab-s00s on/off and config --client openhands carry explicit flags',t=>{
  const f=fixture(t),env={...process.env,BBRAINX_HOME:f.home,BBRAINX_ENTRY:cli,BBRAINX_NODE:process.execPath};
  const run=args=>{const r=spawnSync(process.execPath,[cli,...args],{cwd:f.root,env,encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
  const common=['--root',f.root,'--project','app','--clients','claude,codex,vscode'];
  const on=run(['integrate',...common,'--ab-s00s','on','--ab-s00s-bin',f.bin,'--apply']);assert.equal(on.receipt.files.length,3);
  const config=run(['config','--project','app','--client','openhands','--ab-s00s','on','--ab-s00s-bin',f.bin]);agentSettings.parse(config);
  assert(config.mcp_config['ab-s00s']);
  run(['integrate',...common,'--ab-s00s','off','--apply']);assert.equal(servers('codex',f.read('codex'))['ab-s00s'],undefined);
  const bad=spawnSync(process.execPath,[cli,'integrate',...common,'--ab-s00s','yes','--apply'],{cwd:f.root,env,encoding:'utf8'});
  assert.equal(bad.status,1);assert.match(bad.stderr,/INVALID_AB_S00S_MODE/);
});
