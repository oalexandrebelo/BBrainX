import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {BrainStore} from '../../src/store.mjs';import {LaneRegistry} from '../../src/lanes/registry.mjs';
export const git=(cwd,...args)=>execFileSync('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false','-c','user.name=Test','-c','user.email=test@example.invalid','-C',cwd,...args],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']});
export function laneFixture(t,{register=true}={}){
  const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'bb-lanes-'))),primary=path.join(root,'primary repository'),alpha=path.join(root,'alpha feature'),beta=path.join(root,'beta feature'),home=path.join(root,'private state');
  fs.mkdirSync(primary);git(primary,'init','-q');
  fs.writeFileSync(path.join(primary,'feature.ts'),'export const workspaceMarker = "PRIMARY_MARKER";\n');
  git(primary,'add','.');git(primary,'commit','-qm','initial');
  git(primary,'worktree','add','-q','-b','feat-alpha',alpha,'HEAD');git(primary,'worktree','add','-q','-b','feat-beta',beta,'HEAD');
  fs.writeFileSync(path.join(alpha,'feature.ts'),'export const workspaceMarker = "ALPHA_MARKER";\n');
  fs.writeFileSync(path.join(beta,'feature.ts'),'export const workspaceMarker = "BETA_MARKER";\n');
  const authority=new BrainStore(home),registry=new LaneRegistry(home);authority.register('product',primary);
  if(register){registry.register(authority,'product','alpha',alpha);registry.register(authority,'product','beta',beta);}
  t.after(()=>{registry.close();authority.close();fs.rmSync(root,{recursive:true,force:true});});
  return {root,primary,alpha,beta,home,authority,registry};
}
