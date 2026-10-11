import fs from 'node:fs';import {spawnSync,execFileSync} from 'node:child_process';
if(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw new Error('ISOLATED_CLEAN_WORKTREE_REQUIRED');
const file='src/lanes/store.mjs',original=fs.readFileSync(file,'utf8');
const variants=[
 {name:'local-memory-instead-of-authority',from:'return structuredClone(this.#capture().rows);',to:'return super.memories(project,true);',test:'approved memory is read from'},
 {name:'publish-stale-approved-memory',from:"ensure(this.#readMemory().revision===memory.revision,'SHARED_MEMORY_CHANGED');",to:"ensure(true,'SHARED_MEMORY_CHANGED');",test:'shared memory changing'},
 {name:'retarget-project-with-tool-argument',from:"checkProject(project){ensure(project===this.scopeProject,'LANE_PROJECT_FORBIDDEN');this.registry.active(project,this.binding.id,this.binding.epoch);}",to:'checkProject(project){}',test:'scope cannot be changed'}
];
fs.mkdirSync('artifacts/lanes',{recursive:true});const results=[];
for(const item of variants){if(original.split(item.from).length!==2)throw new Error('AMBIGUOUS_MUTATION');
 try{
  fs.writeFileSync(file,original.replace(item.from,item.to));
  const run=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-name-pattern',item.test,'test/lanes-host.test.mjs'],{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
  const log=(run.stdout||'')+(run.stderr||'');fs.writeFileSync('artifacts/lanes/negative-'+item.name+'.log',log);
  const detected=run.status!==0&&!run.error&&log.includes('ERR_ASSERTION');results.push({name:item.name,detected});if(!detected)throw new Error('NEGATIVE_CONTROL_SURVIVED');
 }finally{fs.writeFileSync(file,original);}
}
fs.writeFileSync('artifacts/lanes/negative-controls.json',JSON.stringify({results},null,2)+'\n');
