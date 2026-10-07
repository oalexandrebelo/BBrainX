import fs from 'node:fs';import path from 'node:path';import {execFileSync,spawnSync} from 'node:child_process';
if(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw new Error('USE_CLEAN_ISOLATED_WORKTREE');
const out='artifacts/observatory';fs.mkdirSync(out,{recursive:true});
const mutations=[
 {name:'cache-added-twice',file:'src/usage/contract.mjs',from:'n.totalTokens??=derived;',to:'n.totalTokens??=derived; if(n.totalTokens!==null)n.totalTokens+=(n.cacheRead??0);',test:'test/usage-contract.test.mjs'},
 {name:'reasoning-counted-again',file:'src/usage/contract.mjs',from:'n.totalTokens??=derived;',to:'n.totalTokens??=derived; if(n.totalTokens!==null)n.totalTokens+=(n.outputReasoning??0);',test:'test/usage-contract.test.mjs'},
 {name:'duplicate-import-double-write',file:'src/usage/store.mjs',from:'if(old?.fingerprint===row.fingerprint)',to:'if(false && old?.fingerprint===row.fingerprint)',test:'test/usage-store.test.mjs'},
 {name:'missing-context-reference',file:'src/context.mjs',from:"if(process.env.BBRAINX_MEASURE_CONTEXT==='1')",to:'if(false)',test:'test/usage-integration.test.mjs'}
];
const results=[];
for(const m of mutations){const source=fs.readFileSync(m.file,'utf8');if(source.split(m.from).length!==2)throw new Error('MUTATION_TARGET_AMBIGUOUS:'+m.name);
 try{
  fs.writeFileSync(m.file,source.replace(m.from,m.to));
  if(!execFileSync('git',['diff','--',m.file],{encoding:'utf8'}).trim())throw new Error('MUTATION_NOT_APPLIED');
  const run=spawnSync(process.execPath,['--test','--test-reporter=tap',m.test],{encoding:'utf8',timeout:60000,maxBuffer:4000000});
  const log=(run.stdout||'')+(run.stderr||'');fs.writeFileSync(path.join(out,'negative-'+m.name+'.log'),log);
  const failures=Number(log.match(/^# fail (\d+)/m)?.[1]??0);const caught=!run.error&&run.status!==0&&failures>0;
  results.push({name:m.name,caught,assertionFailures:failures,exitCode:run.status});if(!caught)throw new Error('MUTATION_SURVIVED:'+m.name);
 }finally{fs.writeFileSync(m.file,source);}
}
if(execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim())throw new Error('MUTATION_CLEANUP_FAILED');
fs.writeFileSync(path.join(out,'negative-controls.json'),JSON.stringify({results,allDetected:results.every(r=>r.caught)},null,2)+'\n');console.log(JSON.stringify(results));
