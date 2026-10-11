import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const out='artifacts/observatory';fs.mkdirSync(out,{recursive:true});const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
execFileSync('git',['archive','--format=zip','--output='+path.join(out,'BBrainX-Observatory-Source.zip'),'HEAD']);
fs.writeFileSync(path.join(out,'BBrainX-Observatory.patch'),execFileSync('git',['diff','a9636e9402e3fa673ae05b3489202da1048aef5e','HEAD','--'],{maxBuffer:8000000}));
// Offline report viewer only. No database, runtime, fonts, logs or private configuration embedded.
let html=fs.readFileSync('public/observatory/index.html','utf8');
html=html.replace('<link rel="stylesheet" href="./observatory.css">','<style>'+fs.readFileSync('public/observatory/observatory.css','utf8')+'</style>');
html=html.replace('<script src="./observatory.js" defer></script>','<script>'+fs.readFileSync('public/observatory/observatory.js','utf8').replace(/<\/script/gi,'<\\/script')+'</script>');
fs.writeFileSync(path.join(out,'BBrainX-Observatory-Offline.html'),html);
for(const file of ['README.md','RESEARCH.md','STRATA.md','SOURCES.md','sources.json'])fs.copyFileSync('docs/observatory/'+file,path.join(out,file));
const files=fs.readdirSync(out).filter(n=>fs.statSync(path.join(out,n)).isFile()).sort().map(file=>({file,bytes:fs.statSync(path.join(out,file)).size,sha256:sha(path.join(out,file))}));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({revision:source,kind:'code-tests-and-documentation-no-private-runtime-state',files},null,2)+'\n');
