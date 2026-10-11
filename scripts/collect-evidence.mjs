import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const output='docs/validation';fs.mkdirSync(output,{recursive:true});fs.mkdirSync('public/demo',{recursive:true});
function copy(source,target){if(!fs.existsSync(source))return false;fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);return true;}
const platforms={};
for(const platform of ['ubuntu-latest','macos-latest','windows-latest']){
 const base=path.join('.ci-evidence','evidence-'+platform);
 const logPath=path.join(base,'tests-'+platform+'.log');
 if(!fs.existsSync(logPath))throw new Error('Missing actual test evidence for '+platform);
 const log=fs.readFileSync(logPath,'utf8').replace(/\x1b\[[0-9;]*m/g,'');
 const count=key=>{const match=log.match(new RegExp('(?:ℹ|#)\\s*'+key+'\\s+(\\d+)'));return match?Number(match[1]):null;};
 const tests=count('tests'),passed=count('pass'),failed=count('fail');
 if(tests===null||failed!==0||passed!==tests)throw new Error('Incomplete or failing test evidence for '+platform);
 const doctor=JSON.parse(fs.readFileSync(path.join(base,'doctor-'+platform+'.json'),'utf8'));
 const benchmark=JSON.parse(fs.readFileSync(path.join(base,'benchmark.json'),'utf8'));
 platforms[platform]={tests,passed,failed,doctor,benchmark};
 copy(logPath,path.join(output,'tests-'+platform+'.log'));
 copy(path.join(base,'benchmark.json'),path.join(output,'benchmark-'+platform+'.json'));
}
const screenshots=['bbrainx-architecture-desktop.png','bbrainx-study-map-desktop.png','bbrainx-workbench-desktop.png','bbrainx-mobile.png'];
for(const name of screenshots)if(!copy(path.join('.ci-browser','artifacts',name),path.join('public/demo',name)))throw new Error('Missing browser evidence '+name);
copy(path.join('.ci-media','media','package-lock.json'),'media/package-lock.json');
const video=copy(path.join('.ci-media','artifacts','bbrainx-intro.mp4'),'public/demo/bbrainx-intro.mp4');
copy(path.join('.ci-upstreams','upstream-inventory.json'),path.join(output,'upstream-inventory.json'));
copy('artifacts/npm-audit.json',path.join(output,'npm-audit.json'));
copy('artifacts/npm-tree.json',path.join(output,'npm-tree.json'));
for(const name of ['sbom-root.cdx.json','sbom-media.cdx.json'])if(!copy(path.join('artifacts',name),path.join(output,name)))throw new Error('Missing lockfile SBOM '+name);
const lockHash=createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex');
// Preserve bounded summaries beyond Actions artifact retention; raw logs remain in the run artifact.
const combinedRoot=path.join('.ci-consolidated','artifacts');
const combined=JSON.parse(fs.readFileSync(path.join(combinedRoot,'consolidated/validation.json'),'utf8'));
if(!combined.passed||combined.revision!==process.env.GITHUB_SHA)throw new Error('Missing or mismatched consolidated evidence');
const combinedReports={};
for(const name of ['consolidated/validation.json','consolidated/labs/index.json','core-contracts/validation.json','core-contracts/negative-controls.json','workstation/validation.json','workstation/mutations.json','observatory/validation.json','observatory/negative-controls.json','observatory/parity.json','lanes/validation.json','lanes/negative-controls.json']){
 const source=path.join(combinedRoot,name),bytes=fs.readFileSync(source),value=JSON.parse(bytes.toString('utf8'));
 if(value.revision&&value.revision!==process.env.GITHUB_SHA)throw new Error('Mismatched evidence revision: '+name);
 const target=path.join(output,'consolidated',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
 combinedReports[name]={file:path.relative(output,target).replaceAll('\\','/'),sha256:createHash('sha256').update(bytes).digest('hex')};
}
const replayBytes=fs.readFileSync(path.join(combinedRoot,'engineering/checkpoint-replay.json'));
const replay=JSON.parse(replayBytes.toString('utf8'));
if(!process.env.GITHUB_SHA||replay?.candidateHead!==process.env.GITHUB_SHA||replay.candidateDirty!==false)throw new Error('Dirty or mismatched checkpoint replay evidence');
const positiveInteger=value=>Number.isSafeInteger(value)&&value>0;
const nonnegativeInteger=value=>Number.isSafeInteger(value)&&value>=0;
const sha256=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const replayCases=['replay-omitted-snapshot','replay-declared-snapshot','idempotency-conflict','new-checkpoint'];
if(!positiveInteger(replay.method?.rounds)||!positiveInteger(replay.method?.pairsPerRound)||!positiveInteger(replay.payload?.canonicalBytes)||!sha256(replay.payload?.sha256)||replay.payload.allReplayHashesEqual!==true||!Array.isArray(replay.results)||replay.results.length!==replayCases.length)throw new Error('Incomplete checkpoint replay evidence');
for(const name of ['benchmarkScript','baselineStore','candidateStore','baselineSession','candidateSession'])if(!sha256(replay.sourceHashes?.[name]))throw new Error('Missing checkpoint replay source hash: '+name);
for(const [name,file] of Object.entries({candidateStore:'src/store.mjs',candidateSession:'src/session.mjs',benchmarkScript:'scripts/checkpoint-replay-benchmark.mjs'})){
 if(replay.sourceHashes[name]!==createHash('sha256').update(fs.readFileSync(file)).digest('hex'))throw new Error('Mismatched checkpoint replay source hash: '+name);
}
for(const name of replayCases){
 const matches=replay.results.filter(result=>result?.case===name);
 if(matches.length!==1)throw new Error('Missing or repeated checkpoint replay case: '+name);
 const result=matches[0],n=replay.method.rounds*(name==='new-checkpoint'?Math.max(20,Math.floor(replay.method.pairsPerRound/5)):replay.method.pairsPerRound);
 if(!positiveInteger(n)||!sha256(result.responseHash)||!Number.isFinite(result.pairedDeltaMedianMs)||!Number.isFinite(result.medianReductionPercent)||!Array.isArray(result.batches)||result.batches.length!==replay.method.rounds)throw new Error('Incomplete checkpoint replay result: '+name);
 for(const variant of ['baseline','candidate']){
  const stats=result[variant],samples=result.samples?.[variant];
  if(stats?.n!==n||!Array.isArray(samples)||samples.length!==n||['medianMs','p95Ms','minMs','maxMs','madMs'].some(key=>!Number.isFinite(stats[key])||stats[key]<0)||stats.minMs>stats.medianMs||stats.medianMs>stats.maxMs||stats.p95Ms>stats.maxMs)throw new Error('Invalid checkpoint replay statistics: '+name+'/'+variant);
  for(const key of ['gitCalls','sqlStatements','sqlReads','sqlWrites','writeTransactions'])if(!nonnegativeInteger(stats.operations?.[key])||samples.some(sample=>!Number.isFinite(sample.ms)||sample.ms<0||!nonnegativeInteger(sample[key]))||samples.reduce((sum,sample)=>sum+sample[key],0)!==stats.operations[key])throw new Error('Invalid checkpoint replay operation counts: '+name+'/'+variant+'/'+key);
 }
 if(result.eventsAdded!==(name==='new-checkpoint'?2*n:0)||(name!=='new-checkpoint'&&['gitCalls','sqlWrites','writeTransactions'].some(key=>result.candidate.operations[key]!==0)))throw new Error('Checkpoint replay invariants failed: '+name);
}
const replayRawSha256=createHash('sha256').update(replayBytes).digest('hex');
const replaySummary={...replay,results:replay.results.map(({samples,...result})=>result),rawSha256:replayRawSha256,samplesOmitted:true};
const replaySummaryFile='engineering/checkpoint-replay-summary.json',replaySummaryBytes=JSON.stringify(replaySummary,null,2)+'\n';
fs.mkdirSync(path.join(output,'engineering'),{recursive:true});fs.writeFileSync(path.join(output,replaySummaryFile),replaySummaryBytes);
const minimumLogPath=path.join('.ci-minimum','tests-node22.log'),minimumLogBytes=fs.readFileSync(minimumLogPath);
const minimumLog=minimumLogBytes.toString('utf8').replace(/\x1b\[[0-9;]*m/g,'');
const minimumCounts={};
for(const key of ['tests','pass','fail','cancelled','skipped','todo']){
 const match=[...minimumLog.matchAll(new RegExp('^(?:ℹ|#)\\s*'+key+'\\s+(\\d+)\\s*$','gm'))].at(-1);
 minimumCounts[key]=match?Number(match[1]):null;
}
if(!positiveInteger(minimumCounts.tests)||minimumCounts.pass!==minimumCounts.tests||['fail','cancelled','skipped','todo'].some(key=>minimumCounts[key]!==0))throw new Error('Incomplete or failing minimum Node test evidence');
const minimumLogFile='tests-node22-minimum.log';fs.writeFileSync(path.join(output,minimumLogFile),minimumLogBytes);
const report={schemaVersion:1,testedRevision:process.env.GITHUB_SHA,runUrl:process.env.GITHUB_SERVER_URL+'/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID,generatedAt:new Date().toISOString(),dependencyLockSha256:lockHash,platforms,browser:{engine:'Chromium',evidence:screenshots,realLocalApi:true},video:{rendered:video,kind:'explanatory-composition-not-product-benchmark'},nativeHarnessApplicationsTested:false,maintainerMacTested:false,modelInferenceTested:false};
report.consolidated={testedRevision:combined.revision,runtimeTests:combined.tests,reports:combinedReports,labCountsAreSeparate:true};
report.engineering={checkpointReplay:{testedRevision:replay.candidateHead,file:replaySummaryFile,sha256:createHash('sha256').update(replaySummaryBytes).digest('hex'),rawSha256:replayRawSha256,samplesOmitted:true}};
report.minimumNode={configuredVersion:'22.20.0',testedRevision:process.env.GITHUB_SHA,file:minimumLogFile,sha256:createHash('sha256').update(minimumLogBytes).digest('hex'),...minimumCounts};
fs.writeFileSync(path.join(output,'ci-report.json'),JSON.stringify(report,null,2)+'\n');
const readme=fs.readFileSync('README.md','utf8');
if(!readme.includes('<!-- verified-preview -->'))fs.writeFileSync('README.md',readme+'\n<!-- verified-preview -->\n## Interface verificada na CI\n\n![Arquitetura interativa BBrainX](public/demo/bbrainx-architecture-desktop.png)\n\n[Relatório por revisão](docs/validation/ci-report.json) · [Vídeo explicativo](public/demo/bbrainx-intro.mp4)\n');
console.log(JSON.stringify({report:path.join(output,'ci-report.json'),platforms:Object.keys(platforms),video}));
