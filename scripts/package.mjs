import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
fs.mkdirSync('artifacts',{recursive:true});
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const names=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const extra of ['package-lock.json','media/package-lock.json'])if(fs.existsSync(extra)&&!names.includes(extra))names.push(extra);
const hashes={schemaVersion:1,commit,files:{}};
for(const name of names.sort()){if(fs.statSync(name).isFile())hashes.files[name]=createHash('sha256').update(fs.readFileSync(name)).digest('hex');}
fs.writeFileSync('artifacts/source-manifest.json',JSON.stringify(hashes,null,2)+'\n');
console.log(JSON.stringify({commit,trackedFiles:names.length,manifest:'artifacts/source-manifest.json'}));
