import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=process.cwd(),out=path.join(root,'artifacts/consolidated');
fs.mkdirSync(out,{recursive:true});
const files=fs.readdirSync('test').filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'test/'+f);
const run=spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{encoding:'utf8',timeout:300000,maxBuffer:16*1024*1024});
const log=(run.stdout??'')+(run.stderr??'');fs.writeFileSync(path.join(out,'tests.log'),log);
const metric=k=>Number(log.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1]??NaN);
const tests=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(k=>[k,metric(k)]));
const passed=!run.error&&run.status===0&&tests.tests>0&&tests.tests===tests.pass&&['fail','cancelled','skipped','todo'].every(k=>tests[k]===0);
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const report={schemaVersion:1,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runId:process.env.GITHUB_RUN_ID??null,observedAt:new Date().toISOString(),passed,
 environment:{node:process.version,platform:process.platform,architecture:process.arch,availableMemoryBytes:os.totalmem()},tests,testFiles:files,
 composition:{atlas:true,mediumReplay:true,observatory:true,coreContractIntegrity:true,parallelLanes:true,contextMeasurementUsesLanePublication:true},
 sourceHashes:Object.fromEntries(['src/context.mjs','src/store.mjs','src/lanes/store.mjs','src/usage/contract.mjs','package-lock.json'].map(p=>[p,sha(p)])),
 limitations:['Suítes de origem são reexecutadas na combinação; as contagens anteriores não são somadas.','Não há inferência, fatura real, sandbox instalado ou homologação de todos os harnesses.','Runner de CI não certifica estação MEDIUM sob carga de trabalho do usuário.','Experimentos independentes possuem relatórios separados e não são habilitados pelo núcleo.']};
fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(!passed)throw new Error('CONSOLIDATED_TESTS_FAILED_OR_INCOMPLETE');
