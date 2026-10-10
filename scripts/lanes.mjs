#!/usr/bin/env node
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { BrainStore } from '../src/store.mjs';
import { stateHome } from '../src/host.mjs';
import { ensure } from '../src/primitives.mjs';
import { LaneRegistry } from '../src/lanes/registry.mjs';
import { LaneStore,bindLaneEngine } from '../src/lanes/store.mjs';
import { laneConfig,LANE_CLIENTS } from '../src/lanes/clients.mjs';

export async function main(argv=process.argv.slice(2)){
  const {values:v,positionals}=parseArgs({args:argv,allowPositionals:true,strict:true,options:{
    project:{type:'string'},lane:{type:'string'},workspace:{type:'string'},client:{type:'string'},harness:{type:'string'},capacity:{type:'string'},help:{type:'boolean'}
  }});
  if(v.help||positionals.length===0){console.log(`BBrainX Lanes — memória comum, worktrees e checkpoints separados.

node scripts/lanes.mjs register --project ID --lane feature-a --workspace /worktrees/feature-a
node scripts/lanes.mjs list --project ID
node scripts/lanes.mjs config --project ID --lane feature-a --client codex
node scripts/lanes.mjs mcp --project ID --lane feature-a
node scripts/lanes.mjs close --project ID --lane feature-a

Worktrees devem ser criadas pelo host via git worktree add. O registro não executa scripts do projeto.
Clientes: ${LANE_CLIENTS.join(', ')}. Configuração só é impressa.
Capacidade padrão: 2 lanes ativas no registro. --capacity (1..16) somente em register.
close revoga o registro, mas nunca apaga worktrees, commits, bancos ou processos.
Serviços Node cooperativos usam startLaneHttpServer; processos arbitrários exigem um sandbox externo.`);return;}
  ensure(positionals.length===1,'UNKNOWN_LANES_COMMAND');const command=positionals[0],home=stateHome();
  ensure(['register','list','config','mcp','close'].includes(command),'UNKNOWN_LANES_COMMAND');
  ensure(v.project,'PROJECT_REQUIRED');if(command!=='list')ensure(v.lane,'LANE_REQUIRED');
  ensure(!v.capacity||command==='register','UNEXPECTED_CAPACITY');
  ensure(!v.workspace||['register','mcp'].includes(command),'UNEXPECTED_WORKSPACE');
  ensure(!v.client||command==='config','UNEXPECTED_CLIENT');
  ensure(!v.harness||command==='mcp','UNEXPECTED_HARNESS');
  if(command==='mcp'){
    // Heavy imports only in the MCP path; registration/configuration stay deterministic and model-free.
    const [{makeEngine,INSTRUCTIONS},{serveMcpStdio}]=await Promise.all([import('../src/engine.mjs'),import('../src/mcp.mjs')]);
    const store=new LaneStore(home,v.project,v.lane);
    try {
      if(v.workspace){const {assertWorkspaceBinding}=await import('../src/workspace.mjs');assertWorkspaceBinding(store,{project:v.project,workspace:v.workspace,lane:v.lane});}
      const engine=bindLaneEngine(makeEngine(store,[v.project]),store);
      const {observeEngine}=await import('../src/control.mjs'),{serverBrand}=await import('../src/brand.mjs');
      const observer=observeEngine(engine,store.authority,{project:v.project,harness:v.harness||'unknown',workspace:store.binding.root,lane:v.lane});
      if(observer.recordingError)console.error(JSON.stringify({observation:'unavailable',code:observer.recordingError}));
      try{await serveMcpStdio(observer.engine,{principal:{id:'local-lane-client'},source:'mcp-stdio',
        instructions:INSTRUCTIONS+' Workspace lane '+v.lane+' is bound by the host to '+store.binding.root+'. Read and write only this workspace; the project memory is shared, checkpoints are workspace-scoped.',
        isFailure:r=>r?.ok===false,serverMetadata:serverBrand(v.project),onConnect:()=>observer.connected()});}
      finally{observer.close();}
    }finally{store.close();}
    return;
  }
  const registry=new LaneRegistry(home,{maxActive:v.capacity===undefined?2:Number(v.capacity)});let authority;
  try{
    authority=new BrainStore(home);authority.project(v.project);
    if(command==='register'){
      ensure(v.workspace,'WORKSPACE_REQUIRED');
      console.log(JSON.stringify(registry.register(authority,v.project,v.lane,v.workspace),null,2));
    }else if(command==='list')console.log(JSON.stringify({project:v.project,lanes:registry.list(v.project),isolation:'cooperative-not-os-sandbox'},null,2));
    else if(command==='close'){
      const b=registry.active(v.project,v.lane);console.log(JSON.stringify(registry.retire(v.project,v.lane,b.epoch),null,2));
    }else{
      const b=registry.verifyBinding(v.project,v.lane);
      console.log(JSON.stringify(laneConfig(v.client??'generic',{node:process.execPath,entry:fileURLToPath(import.meta.url),home,binding:b}),null,2));
    }
  }finally{authority?.close();registry.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(e=>{console.error(JSON.stringify({error:e.code??'LANES_FAILED',detail:e.code?e.message:undefined}));process.exitCode=1;});
