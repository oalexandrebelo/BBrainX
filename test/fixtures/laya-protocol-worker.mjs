// Real subprocess exercising transport failures; no model or inference-quality claim.
import readline from 'node:readline';
import fs from 'node:fs';
const [mode,marker]=process.argv.slice(2),send=message=>process.stdout.write(JSON.stringify(message)+'\n');
if(marker)fs.writeFileSync(marker,String(process.pid));
if(mode==='startup-hang')await new Promise(()=>{process.stdin.resume();});
const ready={op:'ready',ok:true,laya:'protocol-test',torch:'none',device:'cpu',loadMs:1};
if(mode==='startup-invalid')process.stdout.write('{broken\n');
else if(mode==='startup-large')process.stdout.write('x'.repeat(1048577));
else send(ready);
if(mode==='no-read')await new Promise(()=>{setInterval(()=>{},1000);});
for await(const line of readline.createInterface({input:process.stdin})){
  const request=JSON.parse(line),state=request.states[0];
  if(state==='hang')continue;
  if(state==='invalid'){process.stdout.write('{broken\n');continue;}
  if(state==='oversize'){process.stdout.write('x'.repeat(1048577));continue;}
  if(state==='utf8'){process.stdout.write(Buffer.from([255,10]));continue;}
  if(state==='exit')process.exit(2);
  const answers=Object.fromEntries(Object.entries(request.questions).map(([name,q])=>[name,q.type==='choice'?{choice:Object.keys(q.criteria)[0],confidence:.7}:q.type==='score'?{score:2}:{noul:.8,confidence:.7}]));
  const item={answers,truncated:false,stateTokensDropped:0,inputTokens:state.length};
  if(request.strictHead){item.headTruncated=false;item.headWarnings=[];}
  if(state==='state-cut'){item.truncated=true;item.stateTokensDropped=200;}
  if(state==='head-missing'){delete item.headTruncated;delete item.headWarnings;}
  if(state==='head-cut'||state==='head-inconsistent'){
    item.headTruncated=true;item.headWarnings=Object.keys(request.questions);
    if(request.strictHead){item.answers={};item.truncated=state==='head-cut';}
  }
  if(state==='head-unknown'){item.headTruncated=true;item.headWarnings=['unasked'];}
  if(state==='missing')delete item.answers[Object.keys(answers)[0]];
  if(state==='extra')item.answers.unknown={noul:.1};
  if(state==='null')item.answers[Object.keys(answers)[0]]={noul:null};
  if(state==='bad-confidence')item.answers[Object.keys(answers)[0]]={choice:'bug',confidence:null};
  if(state==='bad-probabilities')item.answers[Object.keys(answers)[0]]={choice:'bug',probabilities:{bug:1.1}};
  if(state==='bad-counter')item.inputTokens=-1;
  if(state==='foreign-probabilities')item.answers[Object.keys(answers)[0]]={choice:'bug',probabilities:{bug:.5,foreign:.5}};
  if(state==='bad-sum')item.answers[Object.keys(answers)[0]]={choice:'bug',probabilities:{bug:.2,docs:.2}};
  if(state==='negative-score')item.answers[Object.keys(answers)[0]]={score:-999};
  if(state==='high-score')item.answers[Object.keys(answers)[0]]={score:3};
  if(state==='bad-score-keys')item.answers[Object.keys(answers)[0]]={score:1,probabilities:{'0':.2,'1':.3,'9':.5}};
  if(state==='valid-probabilities')for(const a of Object.values(item.answers))a.probabilities=Object.hasOwn(a,'choice')?{bug:.7,docs:.3}:{'0':.2,'1':.3,'2':.5};
  if(state==='wrong-choice')item.answers[Object.keys(answers)[0]]={choice:'not-a-choice'};
  if(state==='wrong-count'){send({id:request.id,ok:true,ms:1,results:[]});continue;}
  if(state==='env')item.answers[Object.keys(answers)[0]]={choice:process.env.OPENAI_API_KEY||process.env.PYTHONPATH||process.env.NODE_OPTIONS?'leaked':'clean',confidence:1};
  if(state==='delay')await new Promise(resolve=>setTimeout(resolve,100));
  send({id:request.id,ok:true,ms:1,results:request.states.map(()=>item)});
}
