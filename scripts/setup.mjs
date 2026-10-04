import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { doctor } from '../src/host.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const report=doctor();console.log(JSON.stringify(report,null,2));
if(!report.ready){console.error('Instale Node 24 LTS e Git; execute novamente. Nenhuma alteração de sistema foi feita.');process.exit(1);}
function run(args){const npm=process.platform==='win32'?'npm.cmd':'npm';const r=spawnSync(npm,args,{cwd:root,stdio:'inherit',shell:process.platform==='win32'});if(r.status!==0)process.exit(r.status||1);}
if(!fs.existsSync(new URL('../package-lock.json',import.meta.url))){console.error('Lockfile ausente: use uma revisão que inclua package-lock.json. Maintainers: npm install --ignore-scripts.');process.exit(1);}
run(['ci','--ignore-scripts','--no-fund']);run(['run','check']);
console.log('\nPronto para uso local. npm run demo && npm start\nModelos, Docker, credenciais e configurações de IDE não foram alterados.');
