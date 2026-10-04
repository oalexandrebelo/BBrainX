import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const repositories=JSON.parse(fs.readFileSync(new URL('../docs/upstreams.json',import.meta.url),'utf8'));
const download=process.argv.includes('--download');const destination=path.resolve('vendor');
if(download)fs.mkdirSync(destination,{recursive:true});
const report=[];
for(const entry of repositories){
 const url='https://github.com/'+entry.repository+'.git';
 const resolved=spawnSync('git',['ls-remote',url,'HEAD'],{encoding:'utf8',timeout:30000,maxBuffer:65536});
 const sha=resolved.status===0?resolved.stdout.split(/\s/)[0]:null;
 const record={...entry,observedAt:new Date().toISOString(),sha,downloaded:false,executed:false};
 if(download&&sha){
  const target=path.join(destination,entry.repository.replace('/','--'));
  if(fs.existsSync(target)){record.error='Destination exists; review/update explicitly.';}
  else {
   const clone=spawnSync('git',['-c','core.hooksPath=/dev/null','clone','--depth=1','--no-tags',url,target],{encoding:'utf8',timeout:180000,maxBuffer:1048576,env:{...process.env,GIT_LFS_SKIP_SMUDGE:'1',GIT_TERMINAL_PROMPT:'0'}});
   record.downloaded=clone.status===0;
   if(record.downloaded){record.sha=spawnSync('git',['-C',target,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();const license=['LICENSE','LICENSE.md','LICENSE.txt','COPYING'].find(x=>fs.existsSync(path.join(target,x)));record.licenseFile=license||null;record.licenseSha256=license?createHash('sha256').update(fs.readFileSync(path.join(target,license))).digest('hex'):null;}
   else record.error='Clone failed; see git/network policy. No upstream scripts executed.';
  }
 }
 report.push(record);console.error(entry.repository+': '+(record.downloaded?'downloaded for study':sha||'unavailable'));
}
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/upstream-inventory.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({reviewedRepositories:report.length,downloadRequested:download,downloaded:report.filter(x=>x.downloaded).length,scriptExecutionAllowed:false,report:'artifacts/upstream-inventory.json'}));
if(report.some(x=>!x.sha||(download&&!x.downloaded)))process.exitCode=1;
