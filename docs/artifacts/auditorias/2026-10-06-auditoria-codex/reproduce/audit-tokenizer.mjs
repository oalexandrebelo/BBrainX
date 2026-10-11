import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {encode,countTokens} from 'gpt-tokenizer/encoding/o200k_base';
import assert from 'node:assert/strict';
const options={disallowedSpecial:new Set()},file=fileURLToPath(import.meta.url);
let seed=331;
function randomText(n){let s='';for(let i=0;i<n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;s+=String.fromCharCode(97+(seed%26));}return s;}
if(process.argv[2]==='--child'){
 const bytes=Number(process.argv[3]),value=randomText(bytes),t=performance.now(),tokens=countTokens(value,options);
 console.log(JSON.stringify({bytes,tokens,ms:performance.now()-t,rssBytes:process.memoryUsage().rss}));
}else{
 const samples=['português 😀 中文 العربية','a\nb\r\nc','<|endoftext|> literal','x'.repeat(10000),randomText(4096),...Array.from({length:100},(_,i)=>`Boundary ${i}: a função é válida?\n${randomText(40+i)}`)];
 for(const value of samples)assert.equal(countTokens(value,options),encode(value,options).length);
 const text=samples.slice(0,5).join('\n\n'),timings={};
 for(const [name,fn] of [['encodeLength',s=>encode(s,options).length],['countTokens',s=>countTokens(s,options)]]){const values=[];for(let i=0;i<100;i++){const t=performance.now();fn(text);values.push(performance.now()-t);}values.sort((a,b)=>a-b);timings[name]={samples:100,p50Ms:values[49],p95Ms:values[94]};}
 const lengths=[];
 for(const bytes of [8192,16384,32768,65536,131072,262144]){
  const t=performance.now(),p=spawn(process.execPath,['--max-old-space-size=512',file,'--child',String(bytes)],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',x=>stdout+=x);p.stderr.on('data',x=>stderr+=x);
  const timer=setTimeout(()=>p.kill('SIGKILL'),3000);const exit=await new Promise(resolve=>p.once('exit',(code,signal)=>resolve({code,signal})));clearTimeout(timer);
  lengths.push({bytes,exit,wallMs:performance.now()-t,result:exit.code===0?JSON.parse(stdout):null,watchdogMs:3000,stderr:stderr.slice(0,300)});
 }
 const report={observedAt:new Date().toISOString(),library:'gpt-tokenizer 4.0.0',encoding:'o200k_base',node:process.versions.node,parityCases:samples.length,parityAllPassed:true,timings,lengths,limitations:['countTokens avoids the returned token vector, not all internal BPE allocations.','Single long alphanumeric pretoken is an artificial adverse workload.','Each adverse case is a fresh subprocess with 3-second external watchdog and 512MiB V8 old-space limit.','Warm count timings follow encode timings; order/cache effects prevent a controlled speedup claim.']};
 fs.writeFileSync('/private/tmp/bbrainx-audit-20261006/evidence/tokenizer-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
