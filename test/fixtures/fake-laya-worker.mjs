// Fala o protocolo do processo do Laya sem modelo nenhum: serve para testar o lado Node (prazo, disjuntor, queda).
import readline from 'node:readline';
const reply=message=>process.stdout.write(JSON.stringify(message)+'\n');
if(process.argv[2]==='refuse'){reply({op:'ready',ok:false,error:'ValueError',detail:'digest mismatch'});process.exit(1);}
reply({op:'ready',ok:true,laya:'fake',torch:'none',device:'cpu',loadMs:1});
for await(const line of readline.createInterface({input:process.stdin})){
  const request=JSON.parse(line), first=request.states?.[0];
  if(first==='hang')continue;
  if(first==='crash')process.exit(3);
  if(first==='bad'){reply({id:request.id,ok:false,error:'ValueError',detail:'bad request'});continue;}
  reply({id:request.id,ok:true,ms:1,results:request.states.map(state=>({answers:{q:{noul:state.includes('yes')?0.9:0.1,answer_confidence:0.9}},truncated:false,stateTokensDropped:0,inputTokens:state.length}))});
}
