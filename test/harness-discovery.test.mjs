import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {locateHarness} from '../src/recruit.mjs';

function fixture(t){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'bb-harness-discovery-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const executable=relative=>{
    const file=path.join(home,relative);fs.mkdirSync(path.dirname(file),{recursive:true});
    // Reuse the running native binary: cold copies trigger macOS verification under suite load.
    // Windows hard links need no symlink privilege; separate volumes require a copy.
    if(process.platform!=='win32')fs.symlinkSync(process.execPath,file);
    else {
      try{fs.linkSync(process.execPath,file);}
      catch(error){if(!['EXDEV','EPERM','EACCES'].includes(error.code))throw error;fs.copyFileSync(process.execPath,file);}
    }
    return file;
  };
  const broken=relative=>{const file=path.join(home,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'not an executable\n',{mode:0o755});return file;};
  const options={home,env:{PATH:''},platform:'darwin',applicationsRoots:[]};
  return {home,executable,broken,options};
}

test('broken PATH executables are skipped before choosing a native Codex app in user Applications',{skip:process.platform==='win32'?'macOS app layout uses extensionless binaries; exercised on POSIX hosts':false},t=>{
  const f=fixture(t);const broken=f.broken('bin/codex');
  const binary=f.executable('Applications/Codex.app/Contents/Resources/codex-cli/bin/codex');
  const options={...f.options,applicationsRoots:[path.join(f.home,'Applications')],env:{PATH:path.dirname(broken)}};
  assert.deepEqual(locateHarness('codex',options),{binary,source:'known-install'});
  assert.equal(fs.readFileSync(broken,'utf8'),'not an executable\n','discovery never repairs the user CLI');
});

test('PATH fallback considers later entries and explicit invalid overrides fail instead of falling back',t=>{
  const f=fixture(t),name=process.platform==='win32'?'claude.exe':'claude',options={...f.options,platform:process.platform};
  const broken=f.broken('broken/'+name),binary=f.executable('working/'+name);
  const env={PATH:[path.dirname(broken),path.dirname(binary)].join(path.delimiter)};
  assert.deepEqual(locateHarness('claude',{...options,env}),{binary,source:'PATH'});
  for(const override of [broken,f.home,path.join(f.home,'missing'),'relative/claude']){
    assert.throws(()=>locateHarness('claude',{...options,env:{...env,BBRAINX_CLAUDE:override}}),{code:'RECRUIT_HARNESS_OVERRIDE_INVALID'});
  }
  assert.deepEqual(locateHarness('claude',{...options,env:{...env,BBRAINX_CLAUDE:binary}}),{binary,source:'env'});
});

test('Claude extension discovery sorts numeric versions and falls back from unusable newest binaries',t=>{
  const f=fixture(t),name=process.platform==='win32'?'claude.exe':'claude',options={...f.options,platform:process.platform};
  const extension=(editor,version)=>editor+'/extensions/anthropic.claude-code-'+version+'-'+process.platform+'-'+process.arch+'/resources/native-binary/'+name;
  f.executable(extension('.vscode','2.9.0'));
  const binary=f.executable(extension('.vscode','2.10.0'));
  f.broken(extension('.vscode','2.11.0'));
  assert.deepEqual(locateHarness('claude',options),{binary,source:'known-install'});
  const insiders=f.executable(extension('.vscode-insiders','2.12.0'));
  fs.rmSync(path.join(f.home,'.vscode'),{recursive:true});
  assert.deepEqual(locateHarness('claude',options),{binary:insiders,source:'known-install'});
});

test('Claude desktop runtime uses numeric version order and isolated missing installations return null',{skip:process.platform==='win32'?'macOS app layout uses extensionless binaries; exercised on POSIX hosts':false},t=>{
  const f=fixture(t);assert.equal(locateHarness('codex',f.options),null);
  f.executable('Library/Application Support/Claude/claude-code/2.9.0/claude.app/Contents/MacOS/claude');
  const binary=f.executable('Library/Application Support/Claude/claude-code/2.10.0/claude.app/Contents/MacOS/claude');
  assert.deepEqual(locateHarness('claude',f.options),{binary,source:'known-install'});
});

test('Windows discovery accepts native exe files and a semicolon PATH without macOS app lookup',t=>{
  const f=fixture(t);const binary=f.executable('winbin/codex.exe');
  const options={...f.options,platform:'win32',env:{PATH:path.join(f.home,'missing')+';'+path.dirname(binary)}};
  assert.deepEqual(locateHarness('codex',options),{binary,source:'PATH'});
  const claude=f.executable('.vscode-insiders/extensions/anthropic.claude-code-2.10.0-win32-x64/resources/native-binary/claude.exe');
  assert.deepEqual(locateHarness('claude',{...options,env:{PATH:''}}),{binary:claude,source:'known-install'});
});
