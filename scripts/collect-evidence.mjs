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
const report={schemaVersion:1,testedRevision:process.env.GITHUB_SHA,runUrl:process.env.GITHUB_SERVER_URL+'/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID,generatedAt:new Date().toISOString(),dependencyLockSha256:lockHash,platforms,browser:{engine:'Chromium',evidence:screenshots,realLocalApi:true},video:{rendered:video,kind:'explanatory-composition-not-product-benchmark'},nativeHarnessApplicationsTested:false,maintainerMacTested:false,modelInferenceTested:false};
report.consolidated={testedRevision:combined.revision,runtimeTests:combined.tests,reports:combinedReports,labCountsAreSeparate:true};
fs.writeFileSync(path.join(output,'ci-report.json'),JSON.stringify(report,null,2)+'\n');
const readme=fs.readFileSync('README.md','utf8');
if(!readme.includes('<!-- verified-preview -->'))fs.writeFileSync('README.md',readme+'\n<!-- verified-preview -->\n## Interface verificada na CI\n\n![Arquitetura interativa BBrainX](public/demo/bbrainx-architecture-desktop.png)\n\n[Relatório por revisão](docs/validation/ci-report.json) · [Vídeo explicativo](public/demo/bbrainx-intro.mp4)\n');
console.log(JSON.stringify({report:path.join(output,'ci-report.json'),platforms:Object.keys(platforms),video}));
