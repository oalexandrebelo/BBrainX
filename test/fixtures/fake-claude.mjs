// Executável real que imita o contrato não interativo do Claude Code (`-p ... --output-format json`).
// Prova o caminho completo de recrutamento sem precisar de login: argv, cwd (worktree), MCP config e saída JSON.
// stdout num pipe é assíncrono: nunca process.exit() logo após escrever; o código de saída fica em exitCode.
import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2);
const value=flag=>{const i=args.indexOf(flag);return i>=0?args[i+1]:undefined;};
if(args[0]==='--version')console.log('9.9.9 (Claude Code fixture)');
else if(args[0]==='auth'&&args[1]==='status')console.log(JSON.stringify({loggedIn:process.env.FAKE_LOGGED_OUT?false:true,authMethod:'fixture'}));
else{
  const prompt=value('-p')||'',model=value('--model'),effort=value('--effort'),mode=value('--permission-mode'),mcp=value('--mcp-config');
  const record={cwd:process.cwd(),model,effort,mode,mcpConfig:mcp?JSON.parse(mcp):null,allowedTools:args.slice(args.indexOf('--allowedTools')+1),promptHead:prompt.slice(0,160),env:{CLAUDECODE:process.env.CLAUDECODE??null,CLAUDE_CONFIG_DIR:process.env.CLAUDE_CONFIG_DIR??null}};
  fs.writeFileSync(path.join(process.cwd(),'recruit-observed.json'),JSON.stringify(record));
  if(/SLEEP_FOREVER/.test(prompt))setInterval(()=>{},1000);
  else{
    if(mode!=='plan')fs.writeFileSync(path.join(process.cwd(),'recruit-output.txt'),'recruit wrote with '+model+' '+effort+'\n');
    const fail=/FAIL_PLEASE/.test(prompt);
    console.log(JSON.stringify({type:'result',subtype:fail?'error':'success',is_error:fail,result:fail?'could not finish':'done: changed recruit-output.txt',session_id:'fixture-session-1',total_cost_usd:0.0123,usage:{input_tokens:10,output_tokens:5,cache_read_input_tokens:1,cache_creation_input_tokens:2},num_turns:1}));
    process.exitCode=fail?1:0;
  }
}
