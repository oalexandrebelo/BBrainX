// Produtor de falhas de protocolo. Não é modelo, classificador ou benchmark de inferência.
import readline from 'node:readline';
import fs from 'node:fs';
const [mode='normal', audit] = process.argv.slice(2);
const log = value => { if (audit) fs.appendFileSync(audit, JSON.stringify(value)+'\n'); };
log({event:'spawn',pid:process.pid});
if (mode === 'ignore-term') process.on('SIGTERM',()=>{});
const send = value => process.stdout.write(JSON.stringify(value)+'\n');
if (mode === 'no-ready') { setInterval(()=>{}, 1000); }
else {
  if (mode === 'slow-ready') await new Promise(r=>setTimeout(r,50));
  const ready={op:'ready',ok:mode!=='refuse',laya:'transport-fixturé',torch:'none',device:'test-only',loadMs:0};
  if (mode === 'split') for (const byte of Buffer.from(JSON.stringify(ready)+'\n')) process.stdout.write(Buffer.from([byte]));
  else send(ready);
  let number=0;
  for await(const line of readline.createInterface({input:process.stdin})) {
    const request=JSON.parse(line);number++;log({event:'request',pid:process.pid,id:request.id,states:request.states});
    if ((mode === 'hang-first' && number===1) || mode==='ignore-term') continue;
    if (mode==='crash') process.exit(3);
    if (mode==='oversize') {process.stdout.write('x'.repeat(16384));continue;}
    if (mode==='invalid-utf8') {process.stdout.write(Buffer.from([0xff,10]));continue;}
    if (mode==='malformed') {process.stdout.write('{broken\n');continue;}
    if (mode==='error') {send({id:request.id,ok:false,error:'private detail not forwarded'});continue;}
    if (mode==='slow') await new Promise(r=>setTimeout(r,80));
    const response={id:request.id,ok:true,ms:0,results:request.states.map(()=>({answers:{q:{noul:0.25}},truncated:false,inputTokens:1,stateTokensDropped:0}))};
    if(mode==='foreign-id')response.id='unrelated';
    if(mode==='wrong-count')response.results=[];
    if(mode==='unknown-usage')Object.assign(response.results[0],{truncated:null,inputTokens:null,stateTokensDropped:null});
    if(mode==='invalid-value')response.results[0].answers.q.noul=3;
    if(mode==='missing-usage')delete response.results[0].inputTokens;
    send(response);
  }
}
