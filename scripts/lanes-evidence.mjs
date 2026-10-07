import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync,execFileSync} from 'node:child_process';
const out='artifacts/lanes';fs.mkdirSync(out,{recursive:true});
const files=['test/lanes-host.test.mjs','test/lanes-mcp.test.mjs'];
const run=spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
const text=(run.stdout||'')+(run.stderr||'');fs.writeFileSync(path.join(out,'tests.log'),text);
const metric=k=>Number(text.match(new RegExp('^# '+k+' (\\d+)','m'))?.[1]??NaN);
const tests=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(k=>[k,metric(k)]));
if(run.error||run.status!==0||!tests.tests||tests.tests!==tests.pass||tests.fail||tests.skipped||tests.cancelled||tests.todo)throw new Error('LANES_VERIFICATION_FAILED');
const report={schemaVersion:1,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),base:'9e8424cbc95e2d80cdab25c970bdd216aba3f720',observedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID??null,
  environment:{node:process.version,platform:process.platform,architecture:process.arch,physicalMemoryBytes:os.totalmem()},tests,
  tested:{linkedWorktrees:true,concurrentMcpProcesses:true,sharedApprovedMemory:true,separateIndices:true,separateCheckpoints:true,kernelBoundEphemeralPorts:true,serviceProcessShutdown:true},
  notTested:{actualClaudeCode:false,actualCodex:false,actualAntigravity:false,layaInference:false,containers:false,kubernetes:false,nativeMediumUnderLoad:false},
  limitations:['Serviços Node cooperativos; não há supervisor de shell arbitrário nem promessa de remoção de todos os descendentes.','MCP padrão validado com cliente oficial; não homologação universal de toda IDE.','Memória compartilha a autoridade; estado de tarefa e índice permanecem separados por lane.','Nenhum dado de produto privado nem recibo de API foi usado.']};
fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
