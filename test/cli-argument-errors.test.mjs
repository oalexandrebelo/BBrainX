import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const entry=fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url));
function run(t,args){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'bb-cli-args-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  return spawnSync(process.execPath,[entry,...args],{env:{PATH:process.env.PATH,BBRAINX_HOME:home},encoding:'utf8',timeout:15000,input:''});
}
// stdout belongs to the MCP protocol: an argument error must never write there, and must not print a stack trace.
// Node 22 imprime o aviso experimental do node:sqlite no stderr antes do código do produto; só essas duas linhas exatas saem.
const productStderr=text=>text.split('\n').filter(line=>!/^\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature/.test(line)&&!/^\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)$/.test(line)).join('\n');
test('unknown or malformed options exit non-zero with one short JSON error on stderr and an empty stdout',t=>{
  for(const args of [['mcp','--project','x','--bogus'],['mcp','--bogus','--project','x'],['index','--project','x','--nope'],['doctor','--wat'],['mcp','--project'],['search','--query'],['--bogus']]){
    const child=run(t,args);
    assert.equal(child.status,1,args.join(' ')+' must fail: '+child.stderr);
    assert.equal(child.stdout,'',args.join(' ')+' must leave stdout empty');
    const stderr=productStderr(child.stderr);
    assert.equal(stderr.trim().split('\n').length,1,args.join(' ')+' must print one stderr line, got: '+child.stderr);
    const error=JSON.parse(stderr);
    assert.match(error.error,/^[A-Z0-9_]+$/);assert.equal(typeof error.message,'string');assert.ok(error.message.length<400);
    assert.ok(!/\n\s+at |node:internal|file:\/\//.test(stderr),'no stack trace');
  }
});
test('a valid invocation is unaffected by the argument guard',t=>{
  const child=run(t,['help']);assert.equal(child.status,0);assert.match(child.stdout,/BBrainX/);
});
