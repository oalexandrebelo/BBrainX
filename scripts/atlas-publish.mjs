import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const dir=path.resolve('dist-atlas');
if(!fs.existsSync(path.join(dir,'atlas.html')))throw new Error('Build estático ausente. Execute vite.atlas.config.mjs.');
fs.copyFileSync(path.join(dir,'atlas.html'),path.join(dir,'index.html'));
const files=[];
function walk(folder){for(const e of fs.readdirSync(folder,{withFileTypes:true})){const full=path.join(folder,e.name);if(e.isSymbolicLink())throw new Error('Symlink não permitido no pacote estático.');if(e.isDirectory())walk(full);else{const relative=path.relative(dir,full).split(path.sep).join('/');if(relative==='atlas-deployment-manifest.json')continue;if(!/^(?:index\.html|atlas\.html|assets\/[A-Za-z0-9_.-]+\.(?:js|css))$/.test(relative))throw new Error('Arquivo não autorizado no deploy: '+relative);const content=fs.readFileSync(full);files.push({file:relative,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')});}}}
walk(dir);fs.writeFileSync(path.join(dir,'atlas-deployment-manifest.json'),JSON.stringify({schemaVersion:1,kind:'static-documentary-atlas',sourceRevision:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,containsBackend:false,containsProjectMemory:false,files},null,2)+'\n');
console.log('Pacote estático validado: '+files.length+' arquivos, sem backend ou dados de projeto.');
