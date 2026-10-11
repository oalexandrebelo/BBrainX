import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const entry=fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url));
function stderrError(stderr,expected){
  const line=stderr.split(/\r?\n/).find(line=>{
    try{return JSON.parse(line)?.error===expected;}catch{return false;}
  });
  assert.ok(line,`Expected ${expected} JSON error in stderr; received:\n${stderr}`);
  return JSON.parse(line);
}
function fixture(t){
  const directory=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-stable-node-'))),root=path.join(directory,'project'),home=path.join(directory,'state');
  fs.mkdirSync(root);fs.writeFileSync(path.join(root,'README.md'),'# Project\n');
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const run=(node,args=[])=>spawnSync(process.execPath,[entry,'integrate','--root',root,'--project','sample','--clients','claude',...args],{
    cwd:root,env:{...process.env,BBRAINX_HOME:home,BBRAINX_ENTRY:entry,BBRAINX_NODE:node},encoding:'utf8',timeout:15000
  });
  return {directory,root,home,run};
}

test('CLI retains a validated stable Node alias and adopts only its exact legacy command',t=>{
  const f=fixture(t);let alias=path.join(f.directory,'stable-node'+(process.platform==='win32'?'.exe':''));
  try{fs.symlinkSync(process.execPath,alias,'file');}
  catch(error){
    if(process.platform!=='win32'||error.code!=='EPERM')throw error;
    alias=path.dirname(process.execPath)+path.sep+'.'+path.sep+path.basename(process.execPath);
  }
  assert.equal(fs.realpathSync.native(alias),fs.realpathSync.native(process.execPath));
  const target=path.join(f.root,'.mcp.json'),before=JSON.stringify({mcpServers:{bbrainx:{command:alias,args:[entry,'mcp','--project','sample'],env:{BBRAINX_HOME:f.home}}}})+'\n';
  fs.writeFileSync(target,before);
  const withoutOptIn=f.run(alias);assert.equal(withoutOptIn.status,0,withoutOptIn.stderr);assert.equal(JSON.parse(withoutOptIn.stdout).files[0].status,'blocked');
  const preview=f.run(alias,['--adopt-existing']);assert.equal(preview.status,0,preview.stderr);assert.equal(JSON.parse(preview.stdout).files[0].adoption,'exact-legacy-generator');
  assert.equal(fs.readFileSync(target,'utf8'),before);assert.equal(fs.existsSync(f.home),false);
  const applied=f.run(alias,['--adopt-existing','--apply']);assert.equal(applied.status,0,applied.stderr);
  const server=JSON.parse(fs.readFileSync(target,'utf8')).mcpServers.bbrainx;assert.equal(server.command,alias);assert.deepEqual(server.args,[entry,'mcp','--project','sample','--workspace',f.root,'--harness','claude']);
  const repeated=f.run(alias);assert.equal(repeated.status,0,repeated.stderr);assert.equal(JSON.parse(repeated.stdout).files[0].status,'unchanged');
});

test('CLI refuses another Node executable or invalid alias before state or configuration writes',t=>{
  const f=fixture(t),foreign=path.join(f.directory,'other-node'),marker=path.join(f.directory,'executed');
  fs.writeFileSync(foreign,'#!/bin/sh\ntouch "'+marker+'"\n',{mode:0o700});
  for(const [node,expected] of [[foreign,'INTEGRATION_NODE_MISMATCH'],['node','INVALID_INTEGRATION_NODE'],['','INVALID_INTEGRATION_NODE'],[path.join(f.directory,'missing'),'INVALID_INTEGRATION_NODE']]){
    const result=f.run(node,['--adopt-existing','--apply']);assert.equal(result.status,1,result.stdout);
    assert.equal(stderrError(result.stderr,expected).error,expected);
    assert.equal(fs.existsSync(f.home),false);assert.equal(fs.existsSync(path.join(f.root,'.mcp.json')),false);
  }
  assert.equal(fs.existsSync(marker),false);
});
