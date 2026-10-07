import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const dir='artifacts/lanes';fs.mkdirSync(dir,{recursive:true});
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
execFileSync('git',['archive','--format=zip','--output='+path.join(dir,'BBrainX-Lanes-Source.zip'),'HEAD']);
fs.writeFileSync(path.join(dir,'BBrainX-Lanes.patch'),execFileSync('git',['diff','9e8424cbc95e2d80cdab25c970bdd216aba3f720','HEAD','--'],{maxBuffer:12*1024*1024}));
for(const file of fs.readdirSync('docs/lanes'))if(file.endsWith('.md'))fs.copyFileSync('docs/lanes/'+file,path.join(dir,file));
const files=fs.readdirSync(dir).filter(name=>fs.statSync(path.join(dir,name)).isFile()&&name!=='manifest.json').map(file=>{const data=fs.readFileSync(path.join(dir,file));return {file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};});
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({revision,containsPrivateState:false,files},null,2)+'\n');
