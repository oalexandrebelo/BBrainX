import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {BrainStore} from '../src/store.mjs';
import {startServer} from '../src/server.mjs';
import {stateHome} from '../src/host.mjs';

// Explicit real-model acceptance run. Requires an installed profile and a registered project.
// Its synthetic cases validate transport/contracts, not general model quality.
const {values}=parseArgs({options:{project:{type:'string'},out:{type:'string',default:'artifacts/laya/smoke.json'},'expected-device':{type:'string'}}});
assert.ok(values.project,'--project must name an existing registered project');
const home=stateHome(),entry=fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url));
const questions={kind:{type:'choice',instructions:'Classify this request.',criteria:{bug:'fix a software defect',feature:'add new functionality',docs:'write documentation'}},urgent:{type:'noul',instructions:'Is this explicitly urgent?',criteria:{false:'not urgent',true:'urgent'}}};
const args={project:values.project,state:'The build failed because a test timed out.',questions};
const report={observedAt:new Date().toISOString(),kind:'real-local-laya-integration',node:process.version,platform:process.platform,architecture:process.arch,checks:[],results:{},caveats:['Synthetic contract examples, not a blind quality benchmark.','No JEV API invoked; no comparative superiority claim.','MCP connection receipts may be updated; no project memory or checkpoint is written.']};
const store=new BrainStore(home);
try{
  store.project(values.project);
  const before={tasks:store.tasks(values.project),memories:store.memories(values.project)};
  const foreign='laya-smoke-unregistered';assert.ok(!store.projects().some(p=>p.id===foreign),'Reserved smoke project already exists');
  const server=await startServer(store,{port:0,laya:true});
  try{
    const boot=await(await fetch(server.url+'/api/bootstrap')).json();assert.equal(boot.laya.installed,true);
    const call=async input=>await(await fetch(server.url+'/api/invoke',{method:'POST',headers:{'content-type':'application/json','x-bbrainx-csrf':boot.csrf},body:JSON.stringify({action:'decision.evaluate',args:input})})).json();
    const first=await call(args);assert.equal(first.ok,true);assert.equal(first.data.status,'suggested');assert.equal(first.data.cache,'miss');
    if(values['expected-device'])assert.equal(first.data.runtime.device,values['expected-device']);
    report.results.http=first.data;report.checks.push('HTTP real model inference');
    const repeat=await call(args);assert.equal(repeat.data.cache,'hit');assert.deepEqual(repeat.data.answers,first.data.answers);report.results.cached=repeat.data;report.checks.push('Exact repeat avoids worker inference');
    const blocked=await call({...args,project:foreign});assert.equal(blocked.error,'FORBIDDEN');report.checks.push('Foreign project denied before inference');
    const head=await call({...args,questions:{q:{type:'choice',instructions:'Choose.',criteria:{a:'界'.repeat(150),b:'other'}}}});assert.equal(head.data.status,'abstained');assert.equal(head.data.headTruncated,true);assert.deepEqual(head.data.answers,{});report.results.headAbstention=head.data;report.checks.push('Real tokenizer refuses lost option tokens');
    const long=await call({...args,state:'界'.repeat(4000)});assert.equal(long.data.status,'abstained');assert.equal(long.data.truncated,true);assert.ok(long.data.stateTokensDropped>0);report.results.stateAbstention=long.data;report.checks.push('Real inference reports state truncation and abstains');
  }finally{await server.close();}
  const transport=new StdioClientTransport({command:process.execPath,args:[entry,'mcp','--project',values.project,'--laya'],env:{...process.env,BBRAINX_HOME:home},stderr:'pipe'});
  const client=new Client({name:'bbrainx-laya-proof',version:'1.0.0'});
  try{
    await client.connect(transport);const catalog=await client.listTools();assert.ok(catalog.tools.some(tool=>tool.name==='decision_evaluate'));assert.equal(catalog.tools.length,7);report.checks.push('MCP real catalog adds opt-in seventh tool');
    const result=await client.callTool({name:'decision_evaluate',arguments:args});const data=result.structuredContent||JSON.parse(result.content.find(x=>x.type==='text').text);assert.equal(data.ok,true);assert.equal(data.data.status,'suggested');
    if(values['expected-device'])assert.equal(data.data.runtime.device,values['expected-device']);
    report.results.mcp=data.data;report.checks.push('MCP real model inference');
    const refused=await client.callTool({name:'decision_evaluate',arguments:{...args,project:foreign}});assert.equal(refused.isError,true);report.checks.push('MCP foreign project denied');
  }finally{await client.close();await transport.close();}
  assert.deepEqual({tasks:store.tasks(values.project),memories:store.memories(values.project)},before);report.checks.push('No checkpoint or approved-memory mutation');
  report.ok=true;
}catch(error){report.ok=false;report.error={code:error.code||'SMOKE_FAILED',message:error.message};process.exitCode=1;}
finally{store.close();}
fs.mkdirSync(path.dirname(values.out),{recursive:true});fs.writeFileSync(values.out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:report.ok,checks:report.checks.length,out:values.out,error:report.error},null,2));
