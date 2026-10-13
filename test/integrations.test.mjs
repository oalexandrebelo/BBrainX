import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { parse as parseJsonc } from 'jsonc-parser';
import { discoverIntegrations, planIntegrations, applyIntegrationPlan, rollbackIntegration } from '../src/integrations.mjs';

function fixture(t){
  const temp=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-integration-')));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const root=path.join(temp,'project'),home=path.join(temp,'state'),userHome=path.join(temp,'user');
  for(const directory of [root,userHome])fs.mkdirSync(directory);
  const options={root,home,userHome,platform:'linux',project:'sample.v2',node:process.execPath,entry:path.join(temp,'runtime','bin','bbrainx.mjs'),clients:['codex','claude','vscode','kilo'],env:{PATH:''}};
  const write=(file,text)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);return target;};
  return {temp,root,home,userHome,options,write};
}

test('discovery inspects installed names without executing binaries or reading settings',t=>{
  const f=fixture(t),bin=path.join(f.userHome,'bin');fs.mkdirSync(bin);
  const marker=path.join(f.temp,'executed'),binary=path.join(bin,process.platform==='win32'?'codex.EXE':'codex');
  fs.writeFileSync(binary,'#!/bin/sh\ntouch "'+marker+'"\n',{mode:0o700});
  const extension=path.join(f.userHome,'.vscode','extensions','anthropic.claude-code-2.1.0');fs.mkdirSync(extension,{recursive:true});
  const secret=path.join(f.userHome,'.claude.json');fs.writeFileSync(secret,'PRIVATE_CONFIGURATION');
  const report=discoverIntegrations({userHome:f.userHome,env:{PATH:bin,PATHEXT:'.EXE;.CMD;.BAT'}});
  assert.equal(report.clients.find(x=>x.id==='codex').detected,true);
  assert.equal(report.clients.find(x=>x.id==='claude').detected,true);
  assert.equal(report.clients.find(x=>x.id==='kilo').detected,false);
  assert.equal(fs.existsSync(marker),false);assert(!JSON.stringify(report).includes('PRIVATE_CONFIGURATION'));
  assert.equal(report.clients.find(x=>x.id==='codex').version,null);
});

test('Windows inventory honors PATH order and PATHEXT without accepting extensionless files or directories',t=>{
  const f=fixture(t),first=path.join(f.userHome,'first bin'),second=path.join(f.userHome,'second bin');
  fs.mkdirSync(first);fs.mkdirSync(second);
  const wrapper=path.join(first,'codex.CMD'),executable=path.join(second,'codex.EXE'),extensionless=path.join(first,'codex');
  fs.writeFileSync(wrapper,'@echo off\r\nexit /b 99\r\n');fs.writeFileSync(executable,'inventory fixture; must not execute');
  fs.writeFileSync(extensionless,'extensionless executable is not Windows PATH evidence',{mode:0o700});
  fs.mkdirSync(path.join(first,'kilo.EXE'));
  const discover=PATHEXT=>discoverIntegrations({userHome:f.userHome,platform:'win32',env:{PATH:first+';'+second,PATHEXT}});
  const all=discover('.EXE;.CMD;.BAT');
  assert.equal(all.clients.find(x=>x.id==='codex').evidence.find(x=>x.kind==='binary').path,wrapper);
  assert.equal(all.clients.find(x=>x.id==='kilo').detected,false);
  const exeOnly=discover('.EXE');
  assert.equal(exeOnly.clients.find(x=>x.id==='codex').evidence.find(x=>x.kind==='binary').path,executable);
  fs.unlinkSync(wrapper);fs.unlinkSync(executable);
  assert.equal(discover('.EXE;.CMD;.BAT').clients.find(x=>x.id==='codex').detected,false);
  assert.equal(fs.existsSync(f.home),false);
});

test('macOS discovery records ChatGPT/Codex desktop aliases and separates Antigravity IDE',t=>{
  const f=fixture(t),apps=path.join(f.userHome,'Applications'),codex=path.join(apps,'ChatGPT.app'),embedded=path.join(codex,'Contents','Resources','codex-cli','bin','codex');
  fs.mkdirSync(path.dirname(embedded),{recursive:true});fs.writeFileSync(embedded,'do not execute');
  fs.mkdirSync(path.join(apps,'Codex.app'));fs.mkdirSync(path.join(apps,'Antigravity.app'));fs.mkdirSync(path.join(apps,'Antigravity IDE.app'));
  const report=discoverIntegrations({userHome:f.userHome,platform:'darwin',env:{PATH:''}}),desktop=report.clients.find(x=>x.id==='codex'),ide=report.clients.find(x=>x.id==='antigravity');
  assert(desktop.evidence.some(x=>x.path===codex&&x.bundle==='ChatGPT.app'));assert(desktop.evidence.some(x=>x.path===path.join(apps,'Codex.app')));
  assert(desktop.evidence.some(x=>x.path===embedded&&x.kind==='embedded-binary'&&x.executed===false));
  assert(ide.evidence.some(x=>x.path===path.join(apps,'Antigravity IDE.app')));assert(!ide.evidence.some(x=>x.path===path.join(apps,'Antigravity.app')));
});

test('planning is read-only, excludes secrets, and explicit absent clients can be configured',t=>{
  const f=fixture(t);const target=f.write('.mcp.json','{"mcpServers":{"other":{"env":{"API_KEY":"PRIVATE_KEY"}}},"trust":false}\n');
  const initial=fs.readFileSync(target),plan=planIntegrations(f.options);
  assert.equal(plan.root,fs.realpathSync.native(f.root));
  assert.equal(plan.files.length,4);assert(plan.files.every(x=>!x.detected));assert(!JSON.stringify(plan).includes('PRIVATE_KEY'));
  assert.deepEqual(fs.readFileSync(target),initial);assert.equal(fs.existsSync(f.home),false);
  const codex=plan.files.find(x=>x.client==='codex');assert.equal(codex.status,'create');
  assert.equal(planIntegrations({...f.options,clients:undefined}).files.length,0);
});

test('merges preserve unrelated JSONC comments, secrets, trust and provider settings; MCP scope is fixed',t=>{
  const f=fixture(t);f.write('.mcp.json','{\n // operator comment\n "mcpServers": {"other": {"env":{"API_KEY":"PRIVATE_KEY"}}},\n "trust": false,\n}\n');
  f.write('.kilo/kilo.jsonc','{\n // keep provider\n "provider":{"omniroute":{"baseURL":"https://gateway.invalid/v1","key":"SECRET"}},\n "permission":{"*":"ask"}\n}\n');
  const plan=planIntegrations({...f.options,lane:'worktree-1'}),result=applyIntegrationPlan(plan);
  assert.equal(result.status,'applied');assert(!JSON.stringify(result).includes('PRIVATE_KEY'));assert(!JSON.stringify(result).includes('SECRET'));
  const text=fs.readFileSync(path.join(f.root,'.mcp.json'),'utf8'),claude=parseJsonc(text);
  assert(text.includes('// operator comment'));assert.equal(claude.mcpServers.other.env.API_KEY,'PRIVATE_KEY');assert.equal(claude.trust,false);
  const args=claude.mcpServers.bbrainx.args;assert.deepEqual(args,[f.options.entry,'mcp','--project','sample.v2','--lane','worktree-1','--workspace',f.root,'--harness','claude']);
  const kiloText=fs.readFileSync(path.join(f.root,'.kilo/kilo.jsonc'),'utf8'),kilo=parseJsonc(kiloText);
  assert(kiloText.includes('// keep provider'));assert.equal(kilo.provider.omniroute.key,'SECRET');assert.equal(kilo.permission['*'],'ask');assert.equal(kilo.mcp.bbrainx.timeout,60000);assert(!('autoApprove' in kilo.mcp.bbrainx));
  const toml=parseToml(fs.readFileSync(path.join(f.root,'.codex/config.toml'),'utf8'));assert.equal(toml.mcp_servers.bbrainx.env.BBRAINX_HOME,f.home);
  const repeated=planIntegrations({...f.options,lane:'worktree-1'});assert(repeated.files.every(x=>x.status==='unchanged'));assert.equal(applyIntegrationPlan(repeated).status,'unchanged');
  assert.equal(rollbackIntegration({home:f.home,id:result.id}).status,'rolled-back');assert.equal(rollbackIntegration({home:f.home,id:result.id}).status,'rolled-back');
  assert.equal(fs.existsSync(path.join(f.root,'.codex/config.toml')),false);assert.equal(parseJsonc(fs.readFileSync(path.join(f.root,'.mcp.json'),'utf8')).mcpServers.bbrainx,undefined);
});

test('TOML preserves unrelated tables exactly and receipt ownership permits source update',t=>{
  const f=fixture(t),before='# retain model settings\nmodel = "test"\n[mcp_servers.other]\ncommand = "existing"\n[mcp_servers.other.env]\nSECRET = "secret"\n';
  const target=f.write('.codex/config.toml',before);const first=applyIntegrationPlan(planIntegrations({...f.options,clients:['codex']}));
  assert(fs.readFileSync(target,'utf8').startsWith(before));
  const next={...f.options,entry:path.join(f.temp,'runtime-v2','bin','bbrainx.mjs'),clients:['codex']};
  const update=planIntegrations(next);assert.equal(update.files[0].status,'update');const second=applyIntegrationPlan(update);
  assert.equal(parseToml(fs.readFileSync(target,'utf8')).mcp_servers.bbrainx.args[0],next.entry);
  rollbackIntegration({home:f.home,id:second.id});assert.equal(parseToml(fs.readFileSync(target,'utf8')).mcp_servers.bbrainx.args[0],f.options.entry);
  rollbackIntegration({home:f.home,id:first.id});assert.equal(fs.readFileSync(target,'utf8'),before);
});

test('recruitment copies only explicit executable overrides and restores every client byte for byte',t=>{
  const f=fixture(t),marker=path.join(f.temp,'executed'),overrides={};
  for(const name of ['CLAUDE','CODEX']){
    const binary=path.join(f.temp,name.toLowerCase());
    fs.writeFileSync(binary,'#!/bin/sh\ntouch "'+marker+'"\n',{mode:0o700});overrides['BBRAINX_'+name]=binary;
  }
  const originals=new Map([
    [f.write('.mcp.json','{\n // keep Claude settings\n "mcpServers":{"other":{"env":{"TOKEN":"PRIVATE_CLAUDE"}}},"trust":false\n}\n'),null],
    [f.write('.vscode/mcp.json','{\n // keep VS Code settings\n "servers":{"other":{"command":"unchanged"}}\n}\n'),null],
    [f.write('.kilo/kilo.jsonc','{\n // keep optional provider\n "provider":{"omniroute":{"key":"PRIVATE_GATEWAY"}},"permission":{"*":"ask"}\n}\n'),null],
    [f.write('.codex/config.toml','# keep Codex settings\nmodel = "native"\n[mcp_servers.other.env]\nTOKEN = "PRIVATE_CODEX"\n'),null]
  ]);
  for(const file of originals.keys())originals.set(file,fs.readFileSync(file));
  const options={...f.options,recruit:true,env:{...f.options.env,...overrides,ANTHROPIC_API_KEY:'ENV_SECRET',OPENAI_API_KEY:'ENV_SECRET',CLAUDE_CONFIG_DIR:'/private/account',CODEX_HOME:'/private/account'}};
  const plan=planIntegrations(options);
  assert.equal(fs.existsSync(f.home),false);assert.equal(fs.existsSync(marker),false);
  for(const [file,before] of originals)assert.deepEqual(fs.readFileSync(file),before);
  const receipt=applyIntegrationPlan(plan),expectedEnv={BBRAINX_HOME:f.home,...overrides};
  const claude=parseJsonc(fs.readFileSync(path.join(f.root,'.mcp.json'),'utf8'));
  const vscode=parseJsonc(fs.readFileSync(path.join(f.root,'.vscode/mcp.json'),'utf8'));
  const kilo=parseJsonc(fs.readFileSync(path.join(f.root,'.kilo/kilo.jsonc'),'utf8'));
  const codex=parseToml(fs.readFileSync(path.join(f.root,'.codex/config.toml'),'utf8'));
  for(const env of [claude.mcpServers.bbrainx.env,vscode.servers.bbrainx.env,kilo.mcp.bbrainx.environment,codex.mcp_servers.bbrainx.env])assert.deepEqual({...env},expectedEnv);
  assert(claude.mcpServers.bbrainx.args.includes('--recruit'));
  assert.equal(claude.trust,false);assert.equal(claude.mcpServers.other.env.TOKEN,'PRIVATE_CLAUDE');
  assert.equal(kilo.provider.omniroute.key,'PRIVATE_GATEWAY');assert.deepEqual(kilo.permission,{'*':'ask'});
  assert.equal(codex.model,'native');assert.equal(codex.mcp_servers.other.env.TOKEN,'PRIVATE_CODEX');
  for(const [file,before] of originals){
    const after=fs.readFileSync(file,'utf8');assert(after.includes(before.toString('utf8').split('\n')[1]||'# keep Codex settings'));assert(!after.includes('ENV_SECRET'));assert(!after.includes('/private/account'));
  }
  assert(!JSON.stringify({plan,receipt}).includes('PRIVATE_'));assert(!JSON.stringify({plan,receipt}).includes('ENV_SECRET'));
  assert.equal(fs.existsSync(marker),false);assert(planIntegrations(options).files.every(file=>file.status==='unchanged'));
  rollbackIntegration({home:f.home,id:receipt.id});for(const [file,before] of originals)assert.deepEqual(fs.readFileSync(file),before);
});

test('invalid recruit overrides fail before writing and disabled recruitment ignores them',t=>{
  const f=fixture(t),nonExecutable=path.join(f.temp,'not-executable');fs.writeFileSync(nonExecutable,'no',{mode:0o600});
  const invalid=['relative/claude','',path.join(f.temp,'missing'),f.temp,path.join(f.temp,'bad\npath'),...(process.platform==='win32'?[]:[nonExecutable])];
  for(const value of invalid)for(const key of ['BBRAINX_CLAUDE','BBRAINX_CODEX']){
    const options={...f.options,recruit:true,env:{...f.options.env,[key]:value}};
    assert.throws(()=>planIntegrations(options),{code:'INTEGRATION_HARNESS_OVERRIDE_INVALID'});
    assert.equal(fs.existsSync(f.home),false);assert.deepEqual(fs.readdirSync(f.root),[]);
  }
  const options={...f.options,recruit:false,env:{...f.options.env,BBRAINX_CLAUDE:'relative/claude',BBRAINX_CODEX:nonExecutable}};
  const receipt=applyIntegrationPlan(planIntegrations(options));
  const claude=parseJsonc(fs.readFileSync(path.join(f.root,'.mcp.json'),'utf8')).mcpServers.bbrainx;
  assert.deepEqual(claude.env,{BBRAINX_HOME:f.home});assert(!claude.args.includes('--recruit'));
  rollbackIntegration({home:f.home,id:receipt.id});
});

test('recruit overrides default to process env and owned updates keep stale-plan and rollback guards',t=>{
  const f=fixture(t),previous={BBRAINX_CLAUDE:process.env.BBRAINX_CLAUDE,BBRAINX_CODEX:process.env.BBRAINX_CODEX};
  t.after(()=>{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;});
  process.env.BBRAINX_CLAUDE=process.execPath;delete process.env.BBRAINX_CODEX;
  const options={...f.options,clients:['codex'],recruit:true};delete options.env;
  const first=applyIntegrationPlan(planIntegrations(options)),target=path.join(f.root,'.codex/config.toml');
  assert.deepEqual({...parseToml(fs.readFileSync(target,'utf8')).mcp_servers.bbrainx.env},{BBRAINX_HOME:f.home,BBRAINX_CLAUDE:process.execPath});
  process.env.BBRAINX_CODEX=process.execPath;
  const update=planIntegrations(options);assert.equal(update.files[0].status,'update');
  fs.appendFileSync(target,'\n# concurrent edit\n');
  assert.throws(()=>applyIntegrationPlan(update),{code:'INTEGRATION_CONFIG_CHANGED'});
  assert.throws(()=>rollbackIntegration({home:f.home,id:first.id}),{code:'INTEGRATION_ROLLBACK_CHANGED'});
  assert(fs.readFileSync(target,'utf8').endsWith('# concurrent edit\n'));
});

test('server collisions and ambiguous Kilo configs block all writes',t=>{
  const f=fixture(t),target=f.write('.mcp.json','{"mcpServers":{"bbrainx":{"command":"foreign","env":{"SECRET":"PRIVATE"}}}}');
  const plan=planIntegrations(f.options);assert.equal(plan.files.find(x=>x.client==='claude').reason,'INTEGRATION_SERVER_COLLISION');
  assert.throws(()=>applyIntegrationPlan(plan),{code:'INTEGRATION_PLAN_BLOCKED'});assert.equal(fs.existsSync(f.home),false);assert(!JSON.stringify(plan).includes('PRIVATE'));
  fs.unlinkSync(target);f.write('kilo.json','{}');f.write('.kilo/kilo.jsonc','{}');
  assert.equal(planIntegrations({...f.options,clients:['kilo']}).files[0].reason,'INTEGRATION_AMBIGUOUS_KILO_CONFIG');
});

test('managed marker alone grants no ownership; changes after receipt prohibit update',t=>{
  const f=fixture(t);const applied=applyIntegrationPlan(planIntegrations({...f.options,clients:['codex']}));
  const target=path.join(f.root,'.codex/config.toml');fs.appendFileSync(target,'\n# later user edit\n');
  const next=planIntegrations({...f.options,entry:path.join(f.temp,'changed.mjs'),clients:['codex']});assert.equal(next.files[0].reason,'INTEGRATION_SERVER_COLLISION');
  assert.throws(()=>rollbackIntegration({home:f.home,id:applied.id}),{code:'INTEGRATION_ROLLBACK_CHANGED'});
});

test('stale plans and serialized or altered plans cannot write',t=>{
  const f=fixture(t),target=f.write('.mcp.json','{}'),plan=planIntegrations({...f.options,clients:['claude']});
  assert.throws(()=>applyIntegrationPlan(JSON.parse(JSON.stringify(plan))),{code:'INTEGRATION_PLAN_UNTRUSTED'});
  fs.writeFileSync(target,'{"userEdit":true}');assert.throws(()=>applyIntegrationPlan(plan),{code:'INTEGRATION_CONFIG_CHANGED'});assert.equal(fs.existsSync(f.home),false);
  const current=planIntegrations({...f.options,clients:['claude']});current.files[0].target=path.join(f.temp,'outside');assert.throws(()=>applyIntegrationPlan(current),{code:'INTEGRATION_PLAN_UNTRUSTED'});
});

test('symlink files and ancestors, malformed configs, duplicate keys and oversized files fail closed',t=>{
  const f=fixture(t),outside=path.join(f.temp,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(f.root,'.codex'),'dir');
  assert.equal(planIntegrations({...f.options,clients:['codex']}).files[0].reason,'INTEGRATION_SYMLINK_REJECTED');
  const target=f.write('.mcp.json','{"mcpServers":{},"mcpServers":{}}');
  assert.equal(planIntegrations({...f.options,clients:['claude']}).files[0].reason,'INTEGRATION_DUPLICATE_JSON_KEY');
  fs.writeFileSync(target,'invalid');assert.equal(planIntegrations({...f.options,clients:['claude']}).files[0].reason,'INTEGRATION_JSON_INVALID');
  fs.writeFileSync(target,' '.repeat(1024*1024+1));assert.equal(planIntegrations({...f.options,clients:['claude']}).files[0].reason,'INTEGRATION_FILE_TOO_LARGE');
  fs.unlinkSync(target);fs.writeFileSync(path.join(outside,'config'),'{}');fs.symlinkSync(path.join(outside,'config'),target,'file');
  assert.equal(planIntegrations({...f.options,clients:['claude']}).files[0].reason,'INTEGRATION_SYMLINK_REJECTED');
});

test('rollback checks every target before restoring, preserves later edits, and verifies backups',t=>{
  const f=fixture(t);f.write('.mcp.json','{"keep":"SECRET"}');const result=applyIntegrationPlan(planIntegrations(f.options));
  const target=path.join(f.root,'.vscode/mcp.json');fs.appendFileSync(target,'\n ');
  const codex=fs.readFileSync(path.join(f.root,'.codex/config.toml'));assert.throws(()=>rollbackIntegration({home:f.home,id:result.id}),{code:'INTEGRATION_ROLLBACK_CHANGED'});assert.deepEqual(fs.readFileSync(path.join(f.root,'.codex/config.toml')),codex);
  fs.writeFileSync(target,fs.readFileSync(target).subarray(0,-2));
  const dir=path.join(f.home,'integrations',result.id),receipt=JSON.parse(fs.readFileSync(path.join(dir,'receipt.json'),'utf8')),backup=receipt.files.find(x=>x.client==='claude').backup;
  const backupPath=path.join(dir,backup);if(process.platform!=='win32'){assert.equal(fs.statSync(dir).mode&0o777,0o700);assert.equal(fs.statSync(backupPath).mode&0o777,0o600);}
  fs.writeFileSync(backupPath,'corrupted');assert.throws(()=>rollbackIntegration({home:f.home,id:result.id}),{code:'INTEGRATION_BACKUP_INVALID'});
});

test('Antigravity IDE is manual-required and creates neither workspace nor global fallback',t=>{
  const f=fixture(t),plan=planIntegrations({...f.options,clients:['antigravity']});assert.equal(plan.files[0].status,'manual-required');assert.equal(plan.files[0].target,null);
  assert.equal(applyIntegrationPlan(plan).status,'unchanged');assert.equal(fs.existsSync(f.home),false);assert.equal(fs.existsSync(path.join(f.root,'.agents')),false);
});

test('validation rejects noncanonical roots, relative paths and unknown clients',t=>{
  const f=fixture(t),alias=path.join(f.temp,'alias');fs.symlinkSync(f.root,alias,'dir');
  assert.throws(()=>planIntegrations({...f.options,root:alias}),{code:'INTEGRATION_ROOT_NOT_CANONICAL'});
  assert.throws(()=>planIntegrations({...f.options,home:'relative'}),{code:'ABSOLUTE_CONFIG_PATH_REQUIRED'});
  assert.throws(()=>planIntegrations({...f.options,clients:['unknown']}),{code:'UNKNOWN_INTEGRATION_CLIENT'});
});

test('explicit adoption migrates only exact legacy generator entries and restores original bytes',t=>{
  const f=fixture(t),args=[f.options.entry,'mcp','--project',f.options.project],env={BBRAINX_HOME:f.home},server={command:f.options.node,args,env};
  const originals=new Map();
  originals.set(f.write('.mcp.json',JSON.stringify({mcpServers:{bbrainx:server,other:{command:'untouched'}},trust:false},null,2)+'\n'),null);
  originals.set(f.write('.vscode/mcp.json',JSON.stringify({servers:{bbrainx:{type:'stdio',...server}}},null,2)),null);
  originals.set(f.write('.kilo/kilo.json',JSON.stringify({mcp:{bbrainx:{type:'local',command:[f.options.node,...args],environment:env,enabled:true,timeout:60000}},provider:{name:'omniroute'}},null,2)),null);
  originals.set(f.write('.codex/config.toml','# keep user settings\nmodel = "test"\n[mcp_servers.bbrainx]\ncommand = '+JSON.stringify(f.options.node)+'\nargs = '+JSON.stringify(args)+'\nenabled = true\nrequired = false\nstartup_timeout_sec = 12\ntool_timeout_sec = 80\n[mcp_servers.bbrainx.env]\nBBRAINX_HOME = '+JSON.stringify(f.home)+'\n[mcp_servers.other]\ncommand = "untouched"\n'),null);
  for(const target of originals.keys())originals.set(target,fs.readFileSync(target));
  assert(planIntegrations(f.options).files.every(file=>file.status==='blocked'));
  const plan=planIntegrations({...f.options,adoptExisting:true});assert(plan.files.every(file=>file.status==='update'&&file.adoption==='exact-legacy-generator'));
  const result=applyIntegrationPlan(plan),config=parseToml(fs.readFileSync(path.join(f.root,'.codex/config.toml'),'utf8'));
  assert.equal(config.model,'test');assert.equal(config.mcp_servers.other.command,'untouched');assert.equal(config.mcp_servers.bbrainx.startup_timeout_sec,12);assert.equal(config.mcp_servers.bbrainx.tool_timeout_sec,80);
  assert(planIntegrations(f.options).files.every(file=>file.status==='unchanged'));
  rollbackIntegration({home:f.home,id:result.id});for(const [target,before] of originals)assert.deepEqual(fs.readFileSync(target),before);
});

test('legacy adoption adds explicit recruit runtimes without accepting unknown env or unowned modern entries',t=>{
  const f=fixture(t),legacyArgs=[f.options.entry,'mcp','--project',f.options.project],legacyEnv={BBRAINX_HOME:f.home};
  const overrides={BBRAINX_CLAUDE:process.execPath,BBRAINX_CODEX:process.execPath},options={...f.options,recruit:true,adoptExisting:true,env:{...f.options.env,...overrides}};
  const formats={
    claude:{file:'.mcp.json',render:(args,env)=>JSON.stringify({mcpServers:{bbrainx:{command:f.options.node,args,env}},trust:false}),read:()=>parseJsonc(fs.readFileSync(path.join(f.root,'.mcp.json'),'utf8')).mcpServers.bbrainx.env},
    vscode:{file:'.vscode/mcp.json',render:(args,env)=>JSON.stringify({servers:{bbrainx:{type:'stdio',command:f.options.node,args,env}}}),read:()=>parseJsonc(fs.readFileSync(path.join(f.root,'.vscode/mcp.json'),'utf8')).servers.bbrainx.env},
    kilo:{file:'.kilo/kilo.json',render:(args,env)=>JSON.stringify({mcp:{bbrainx:{type:'local',command:[f.options.node,...args],environment:env,enabled:true,timeout:60000}},provider:{name:'omniroute'}}),read:()=>parseJsonc(fs.readFileSync(path.join(f.root,'.kilo/kilo.json'),'utf8')).mcp.bbrainx.environment},
    codex:{file:'.codex/config.toml',render:(args,env)=>'# keep user settings\nmodel = "native"\n[mcp_servers.bbrainx]\ncommand = '+JSON.stringify(f.options.node)+'\nargs = '+JSON.stringify(args)+'\n[mcp_servers.bbrainx.env]\n'+Object.entries(env).map(([key,value])=>key+' = '+JSON.stringify(value)).join('\n')+'\n',read:()=>parseToml(fs.readFileSync(path.join(f.root,'.codex/config.toml'),'utf8')).mcp_servers.bbrainx.env}
  };
  const originals=new Map();
  for(const format of Object.values(formats)){const file=f.write(format.file,format.render(legacyArgs,legacyEnv));originals.set(file,fs.readFileSync(file));}
  assert(planIntegrations({...options,adoptExisting:false}).files.every(file=>file.status==='blocked'));
  const plan=planIntegrations(options);assert(plan.files.every(file=>file.status==='update'&&file.adoption==='exact-legacy-generator'));
  const receipt=applyIntegrationPlan(plan);
  for(const format of Object.values(formats))assert.deepEqual({...format.read()},{...legacyEnv,...overrides});
  assert(planIntegrations(options).files.every(file=>file.status==='unchanged'));
  rollbackIntegration({home:f.home,id:receipt.id});for(const [file,before] of originals)assert.deepEqual(fs.readFileSync(file),before);
  for(const [client,format] of Object.entries(formats))for(const [args,env] of [
    [legacyArgs,{...legacyEnv,API_KEY:'UNRECOGNIZED_SECRET'}],
    [legacyArgs,{...legacyEnv,BBRAINX_CLAUDE:process.execPath}],
    [[...legacyArgs,'--recruit','--workspace',f.root,'--harness',client],legacyEnv]
  ]){
    const file=f.write(format.file,format.render(args,env)),before=fs.readFileSync(file),blocked=planIntegrations({...options,clients:[client]});
    assert.equal(blocked.files[0].reason,'INTEGRATION_SERVER_COLLISION');assert.throws(()=>applyIntegrationPlan(blocked),{code:'INTEGRATION_PLAN_BLOCKED'});
    assert(!JSON.stringify(blocked).includes('UNRECOGNIZED_SECRET'));assert.deepEqual(fs.readFileSync(file),before);
  }
});

test('adoption opt-in rejects different runtime, provider secrets, approval keys and extra arguments',t=>{
  const f=fixture(t),base={command:f.options.node,args:[f.options.entry,'mcp','--project',f.options.project],env:{BBRAINX_HOME:f.home}},target=path.join(f.root,'.mcp.json');
  for(const server of [{...base,command:'/other/node'},{...base,args:['/other/entry','mcp','--project',f.options.project]},{...base,env:{...base.env,API_KEY:'SECRET'}},{...base,autoApprove:['*']},{...base,args:[...base.args,'--unsafe']},{...base,args:[f.options.entry,'mcp','--project','other']}]){
    fs.writeFileSync(target,JSON.stringify({mcpServers:{bbrainx:server}}));const plan=planIntegrations({...f.options,clients:['claude'],adoptExisting:true});
    assert.equal(plan.files[0].reason,'INTEGRATION_SERVER_COLLISION');assert.throws(()=>applyIntegrationPlan(plan),{code:'INTEGRATION_PLAN_BLOCKED'});assert(!JSON.stringify(plan).includes('SECRET'));
  }
});

test('adoption keeps CAS guard and rejects ambiguous legacy TOML without changing files',t=>{
  const f=fixture(t),args=[f.options.entry,'mcp','--project',f.options.project],server={command:f.options.node,args,env:{BBRAINX_HOME:f.home}};
  const target=f.write('.mcp.json',JSON.stringify({mcpServers:{bbrainx:server}})),plan=planIntegrations({...f.options,clients:['claude'],adoptExisting:true});
  fs.appendFileSync(target,'\n');assert.throws(()=>applyIntegrationPlan(plan),{code:'INTEGRATION_CONFIG_CHANGED'});
  f.write('.codex/config.toml','[mcp_servers.bbrainx]\ncommand = '+JSON.stringify(f.options.node)+' # user annotation\nargs = '+JSON.stringify(args)+'\n[mcp_servers.bbrainx.env]\nBBRAINX_HOME = '+JSON.stringify(f.home)+'\n');
  assert.equal(planIntegrations({...f.options,clients:['codex'],adoptExisting:true}).files[0].reason,'INTEGRATION_LEGACY_TOML_AMBIGUOUS');
});
