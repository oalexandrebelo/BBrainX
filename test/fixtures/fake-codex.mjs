// Executável real que imita `codex exec --json -o <file>` e `codex app-server`: eventos JSONL, última mensagem no arquivo, escrita na worktree.
// stdout num pipe é assíncrono: nunca process.exit() logo após escrever.
import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2);
const value=flag=>{const i=args.indexOf(flag);return i>=0?args[i+1]:undefined;};
if(args[0]==='--version')console.log('codex-cli 9.9.9 (fixture)');
else if(args[0]==='login'&&args[1]==='status')console.log(process.env.FAKE_LOGGED_OUT?'Not logged in':'Logged in using ChatGPT (fixture)');
else if(args.includes('app-server')){
  // Como o app-server real: responde linha a linha com stdin aberto; encerra no EOF.
  let buffer='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{buffer+=chunk;const lines=buffer.split('\n');buffer=lines.pop();
    for(const line of lines){if(!line.trim())continue;const m=JSON.parse(line);if(m.id===1)console.log(JSON.stringify({id:1,result:{userAgent:'fixture'}}));
      if(m.id===2)console.log(JSON.stringify({id:2,result:{rateLimits:{primary:{usedPercent:12,windowDurationMins:300,resetsAt:1900000000},secondary:{usedPercent:3,windowDurationMins:10080,resetsAt:1900500000},planType:'fixture'},rateLimitResetCredits:{availableCount:1}}}));}
  });
}else{
  const configs=args.flatMap((a,i)=>a==='-c'?[args[i+1]]:[]);
  const prompt=args.at(-1),cwd=value('-C'),out=value('-o');
  fs.writeFileSync(path.join(cwd,'recruit-observed.json'),JSON.stringify({cwd,model:value('-m'),sandbox:value('--sandbox'),configs,promptHead:prompt.slice(0,160),env:{CODEX_HOME:process.env.CODEX_HOME??null}}));
  if(value('--sandbox')!=='read-only')fs.writeFileSync(path.join(cwd,'recruit-output.txt'),'codex fixture wrote '+value('-m')+'\n');
  console.log(JSON.stringify({type:'thread.started',thread_id:'fixture-thread-9'}));
  console.log(JSON.stringify({type:'turn.started'}));
  console.log(JSON.stringify({type:'item.completed',item:{id:'item_0',type:'agent_message',text:'codex done'}}));
  console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:30,cached_input_tokens:20,cache_write_input_tokens:0,output_tokens:7,reasoning_output_tokens:2}}));
  if(out)fs.writeFileSync(out,'codex done\n');
}
