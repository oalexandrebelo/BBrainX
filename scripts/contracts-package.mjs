import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const dir='artifacts/core-contracts';fs.mkdirSync(dir,{recursive:true});
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
execFileSync('git',['archive','--format=zip','--output='+path.join(dir,'BBrainX-Contract-Integrity-Source.zip'),'HEAD']);
fs.writeFileSync(path.join(dir,'BBrainX-Contract-Integrity.patch'),execFileSync('git',['diff','a9636e9402e3fa673ae05b3489202da1048aef5e','HEAD','--'],{maxBuffer:12000000}));
for(const name of ['REVIEW.md','OPPORTUNITIES.md','VALIDATION.md','SOURCES.md','ASYNC_VALIDATION.md','SOURCE_UPDATES.md']){
  const file='docs/core-contracts/'+name;if(fs.existsSync(file))fs.copyFileSync(file,path.join(dir,name));
}
const files=fs.readdirSync(dir).sort().filter(n=>fs.statSync(path.join(dir,n)).isFile()&&n!=='manifest.json').map(file=>{const data=fs.readFileSync(path.join(dir,file));return {file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};});
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({revision,containsPrivateProjectState:false,files},null,2)+'\n');
