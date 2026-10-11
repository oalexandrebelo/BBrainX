// Transport-protocol worker that reports its own spawn environment to a file. No model, no inference claim.
// Usage: env-report-worker.mjs <report-file>
import readline from 'node:readline';
import fs from 'node:fs';
const [report]=process.argv.slice(2),send=message=>process.stdout.write(JSON.stringify(message)+'\n');
fs.writeFileSync(report,JSON.stringify({env:process.env,execArgv:process.execArgv,argv:process.argv.slice(2)}));
send({op:'ready',ok:true,laya:'env-report',torch:'none',device:'cpu',loadMs:1});
for await(const line of readline.createInterface({input:process.stdin})){
  const request=JSON.parse(line);
  send({id:request.id,ok:true,ms:1,results:request.states.map(()=>({
    answers:Object.fromEntries(Object.keys(request.questions).map(name=>[name,{noul:.5,confidence:.5}])),
    truncated:false,stateTokensDropped:0,inputTokens:1}))});
}
