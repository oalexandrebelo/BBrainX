import { test } from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';import { createHash } from 'node:crypto';
import { BrainStore } from '../src/store.mjs';
import { indexProject, search } from '../src/retrieval.mjs';
import { compileContext, tokenCount } from '../src/context.mjs';
import { evaluateRetrieval } from '../src/evaluation.mjs';
import { plainWord, stemPrefix } from '../src/analyze.mjs';
import { translate } from '../src/glossary.mjs';
import { LayaBroker, fetchWeights, layaPaths, layaStatus } from '../src/laya.mjs';
import { onPath, scenario } from '../src/scenario.mjs';
import { CLIENTS, clientConfig } from '../src/clients.mjs';

const bin=fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url)), fakeWorker=fileURLToPath(new URL('./fixtures/fake-laya-worker.mjs',import.meta.url));
function workspace(t,files={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-god-')), root=path.join(dir,'repo');fs.mkdirSync(root);
  for(const [name,body] of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),body);}
  const store=new BrainStore(path.join(dir,'state'));store.register('test',root);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {dir,root,store};
}

// ── consulta em linguagem natural ─────────────────────────────────────────
test('a Portuguese question reaches English code through stems and the pt → en bridge',t=>{
  const {store}=workspace(t,{
    'src/session.ts':'export function refuse(record) {\n  if (record.expired) throw new Error("rejected session");\n  return record;\n}\n',
    'src/invoice.ts':'export function total(lines) {\n  return lines.reduce((sum, line) => sum + line.amount, 0);\n}\n',
    'src/colors.ts':'export const palette = ["amber", "teal"];\n'
  });indexProject(store,'test');
  // Nenhuma palavra da pergunta aparece no arquivo: quem liga os dois é o radical (expir*) e o glossário (sess → session, rejeit → reject).
  const found=search(store,'test','onde a sessão expirada é rejeitada').items;
  assert.equal(found[0].path,'src/session.ts');assert.ok(found.every(item=>item.path!=='src/colors.ts'));
  assert.equal(search(store,'test','sessão').items[0].path,'src/session.ts');
  assert.equal(search(store,'test','paleta').items[0].path,'src/colors.ts','a cognate is reached by its stem alone');
  assert.equal(search(store,'test','cozinha da fazenda').items.length,0,'no bridge is invented for words outside the vocabulary');
});
test('stop words leave the query only when a discriminating term remains',t=>{
  const {store}=workspace(t,{'a.md':'como e onde\n','b.ts':'export function settle(){ return "where"; }\n'});indexProject(store,'test');
  assert.deepEqual(search(store,'test','onde como settle').items.map(item=>item.path),['b.ts']);
  assert.deepEqual(search(store,'test','como onde').items.map(item=>item.path),['a.md'],'a query made only of stop words still searches for them');
});
test('stems and bridge are bounded: short words, identifiers and long suffixes are left alone',()=>{
  assert.equal(plainWord('Sessão'),'sessao');assert.equal(plainWord('utf8'),null);assert.equal(plainWord('user_id'),null);
  assert.equal(stemPrefix('rejeitada'),'rejeit');assert.equal(stemPrefix('index'),null);assert.equal(stemPrefix('tokens'),'toke');
  assert.deepEqual(translate('rejeitada'),['reject']);assert.ok(translate('arquivos').includes('file'));
  assert.deepEqual(translate('contexto'),['context'],'"contag" must not capture "contexto"');
  assert.deepEqual(translate('datas'),['date','data']);assert.deepEqual(translate('database'),[],'a short key accepts only a short suffix');
  assert.deepEqual(translate('xyz'),[]);
});
test('an exact match still outranks a stem match',t=>{
  const {store}=workspace(t,{'exact.ts':'export const note = "the migration ran";\n','stem.ts':'export const note = "the migrator ran";\n'});indexProject(store,'test');
  assert.deepEqual(search(store,'test','migration').items.map(item=>item.path),['exact.ts','stem.ts']);
});
test('natural-language retrieval over this repository keeps a minimum quality',t=>{
  const repository=fileURLToPath(new URL('../',import.meta.url)), dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-natural-'));
  const store=new BrainStore(dir);t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  store.register('self',repository);indexProject(store,'self');
  const cases=JSON.parse(fs.readFileSync(new URL('./fixtures/eval-natural.cases',import.meta.url),'utf8')), report=evaluateRetrieval(store,'self',cases);
  // Piso abaixo do medido em 04/10/2026 (acerto em 3: 0,78; em 10: 0,94), porque a documentação deste repositório muda.
  assert.ok(report.total.hit3>=0.6,'hit@3 = '+report.total.hit3);assert.ok(report.total.hit10>=0.85,'hit@10 = '+report.total.hit10);
});

// ── pacote de contexto ─────────────────────────────────────────────────────
test('documentation takes at most half of the pack while code is a candidate',t=>{
  const prose=name=>'# Retry policy '+name+'\n'+('The retry policy waits and then sends the request again. '.repeat(7)+'\n').repeat(3);
  const filler=Array.from({length:24},(_,line)=>'  const step'+line+' = attempts - '+line+';').join('\n');
  const files={'src/again.ts':'// policy\nexport function again(call, attempts) {\n'+filler+'\n  return attempts > 0 ? call() : null;\n}\n'};
  for(const name of ['a','b','c','d','e','f'])files['docs/'+name+'.md']=prose(name);
  const {store,root}=workspace(t,files);indexProject(store,'test');
  const ranked=search(store,'test','retry policy request').items;
  assert.ok(ranked.slice(0,6).every(item=>item.kind==='doc'),'the fixture needs the six documents to outrank the code');
  const codeTokens=tokenCount(fs.readFileSync(path.join(root,'src/again.ts'),'utf8')), docTokensEach=tokenCount(prose('a'));
  assert.ok(codeTokens>200&&docTokensEach*4+codeTokens>1200,'without the quota the code would not fit: '+codeTokens+' + 4 × '+docTokensEach);
  const pack=compileContext(store,{project:'test',query:'retry policy request',budget:1200});
  assert.ok(pack.sources.some(source=>source.path==='src/again.ts'),'the code must be in the pack');
  const docs=pack.sources.filter(source=>source.kind==='doc').length;
  assert.ok(docs>=1&&docs*docTokensEach<=600,docs+' documents of '+docTokensEach+' tokens in a 1200 budget');
  assert.ok(pack.sourcesOmittedByBudget>0);assert.equal(pack.selection,'lexical-ranked-with-doc-quota');
});
test('without code among the candidates, documentation may use the whole pack',t=>{
  const files={};for(const name of ['a','b','c','d'])files[name+'.md']='# Deploy notes '+name+'\n'+'Deploy notes for the release window. '.repeat(45)+'\n';
  const {store}=workspace(t,files);indexProject(store,'test');
  const pack=compileContext(store,{project:'test',query:'deploy notes',budget:1200});
  assert.ok(pack.payloadTokens>700,'docs filled '+pack.payloadTokens+' tokens');
});

// ── perfil Laya (lado Node, com um processo falso) ─────────────────────────
const fake=(...extra)=>new LayaBroker({command:[process.execPath,fakeWorker,...extra],deadlineMs:150,startMs:5000});
test('Laya broker answers through the worker protocol and reports the runtime',async t=>{
  const broker=fake();t.after(()=>broker.stop());
  const reply=await broker.decide(['yes please','no'],{q:{type:'noul',instructions:'?'}});
  assert.equal(reply.ok,true);assert.deepEqual(reply.results.map(result=>result.answers.q.noul),[0.9,0.1]);
  assert.deepEqual(broker.info,{laya:'fake',torch:'none',device:'cpu',loadMs:1});
});
test('Laya broker never throws: deadline, refusal and crash become reasons, and three failures open the breaker',async t=>{
  const slow=fake();t.after(()=>slow.stop());
  assert.deepEqual(await slow.decide(['hang'],{q:{}}),{ok:false,reason:'TIMEOUT'});
  assert.deepEqual(await slow.decide(['bad'],{q:{}}),{ok:false,reason:'ERROR'});
  assert.equal((await slow.decide(['fine yes'],{q:{}})).ok,true,'one success closes the count');
  assert.deepEqual(await slow.decide(['hang'],{q:{}}),{ok:false,reason:'TIMEOUT'});
  assert.deepEqual(await slow.decide(['hang'],{q:{}}),{ok:false,reason:'TIMEOUT'});
  assert.deepEqual(await slow.decide(['hang'],{q:{}}),{ok:false,reason:'TIMEOUT'});
  assert.deepEqual(await slow.decide(['fine yes'],{q:{}}),{ok:false,reason:'DEGRADED'},'the open breaker answers without asking the worker');
  const crashing=fake();t.after(()=>crashing.stop());
  assert.deepEqual(await crashing.decide(['crash'],{q:{}}),{ok:false,reason:'UNAVAILABLE'});
  assert.equal((await crashing.decide(['back yes'],{q:{}})).ok,true,'a dead worker is started again on the next call');
  assert.deepEqual(await fake('refuse').decide(['x'],{q:{}}),{ok:false,reason:'UNAVAILABLE'});
  assert.deepEqual(await new LayaBroker({command:[path.join(os.tmpdir(),'no-such-binary-bbrainx')]}).decide(['x'],{q:{}}),{ok:false,reason:'UNAVAILABLE'});
});
test('weights are installed only when size and SHA-256 match, and are not downloaded twice',async t=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-weights-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const body=Buffer.from('weights-of-a-model'), digest=createHash('sha256').update(body).digest('hex'), files=[{path:'tokenizer/vocab.json',bytes:body.length,sha256:digest}];
  let calls=0;const serve=content=>async()=>{calls++;return new Response(content);};
  const target=path.join(layaPaths(home).model,'tokenizer/vocab.json');
  await assert.rejects(fetchWeights({home,files,fetchImpl:serve(Buffer.from('weights-of-a-m0del'))}),error=>error.code==='LAYA_DIGEST_MISMATCH');
  await assert.rejects(fetchWeights({home,files,fetchImpl:serve(Buffer.concat([body,body]))}),error=>error.code==='LAYA_DIGEST_MISMATCH');
  await assert.rejects(fetchWeights({home,files,fetchImpl:async()=>new Response('missing',{status:404})}),error=>error.code==='LAYA_DOWNLOAD_FAILED');
  assert.equal(fs.existsSync(target),false);assert.equal(fs.existsSync(target+'.partial'),false,'a refused download leaves nothing behind');
  assert.deepEqual(await fetchWeights({home,files,fetchImpl:serve(body)}),[{path:'tokenizer/vocab.json',action:'downloaded'}]);
  const before=calls;
  assert.deepEqual(await fetchWeights({home,files,fetchImpl:serve(body)}),[{path:'tokenizer/vocab.json',action:'kept'}]);assert.equal(calls,before);
  fs.writeFileSync(target,'tampered-contents!');
  assert.deepEqual(await fetchWeights({home,files,fetchImpl:serve(body)}),[{path:'tokenizer/vocab.json',action:'downloaded'}],'a tampered file is replaced');
  const status=layaStatus(home);assert.equal(status.installed,false);assert.equal(status.changesContextPack,false);
});

// ── cenário e harnesses ────────────────────────────────────────────────────
test('the scenario finds tools on PATH without running them',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-path-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const marker=path.join(dir,'executed');
  // No Windows o executável tem extensão; o conteúdo não importa, porque nada aqui pode ser executado.
  const extension=process.platform==='win32'?'.CMD':'';
  for(const name of ['claude','uv'])fs.writeFileSync(path.join(dir,name+extension),'#!/bin/sh\ntouch "'+marker+'"\n',{mode:0o755});
  fs.mkdirSync(path.join(dir,'codex'+extension));
  const env={PATH:dir,PATHEXT:'.CMD'};
  assert.equal(onPath('claude',env),path.join(dir,'claude'+extension));assert.equal(onPath('codex',env),null,'a directory is not a tool');assert.equal(onPath('gemini',env),null);
  const report=scenario({home:path.join(dir,'state'),env});
  assert.deepEqual(report.harnesses,{claude:true,codex:false,'cursor-agent':false,gemini:false,opencode:false});
  assert.equal(report.tools.uv,true);assert.equal(report.tools.docker,false);assert.equal(report.profiles.laya.installed,false);
  assert.equal(report.steps.find(step=>step.area==='perfil laya').state,'disponível');
  assert.match(report.steps.find(step=>step.area==='harness').command,/--client claude$/);
  assert.equal(fs.existsSync(marker),false,'nothing found on PATH may be executed');
});
test('each client gets its own configuration shape, with paths that survive spaces',()=>{
  const options={node:'/opt/node',entry:'/Users/me/My Apps/bbrainx.mjs',project:'app',home:'/Users/me/Library/Application Support/BBrainX'};
  const jsonOf=textValue=>JSON.parse(textValue.slice(textValue.indexOf('{')));
  assert.deepEqual(jsonOf(clientConfig('cursor',options)).mcpServers.bbrainx,{type:'stdio',command:'/opt/node',args:[options.entry,'mcp','--project','app'],env:{BBRAINX_HOME:options.home}});
  assert.equal(jsonOf(clientConfig('vscode',options)).servers.bbrainx.type,'stdio');
  assert.deepEqual(jsonOf(clientConfig('gemini',options)).mcpServers.bbrainx.args,[options.entry,'mcp','--project','app']);
  const claude=clientConfig('claude',options);
  assert.match(claude,/claude mcp add bbrainx --env BBRAINX_HOME='\/Users\/me\/Library\/Application Support\/BBrainX' -- \/opt\/node '\/Users\/me\/My Apps\/bbrainx\.mjs' mcp --project app/);
  assert.match(clientConfig('codex',options),/\[mcp_servers\.bbrainx\]\ncommand = "\/opt\/node"\nargs = \["\/Users\/me\/My Apps\/bbrainx\.mjs","mcp","--project","app"\]/);
  assert.throws(()=>clientConfig('unknown',options),error=>error.code==='UNKNOWN_CLIENT');
  assert.deepEqual([...CLIENTS],['claude','codex','cursor','vscode','gemini']);
});
test('`up` registers, indexes and names the next steps; running it again reuses the project',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-up-')), root=path.join(dir,'My Project (v2)');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.mkdirSync(root);fs.writeFileSync(path.join(root,'main.py'),'def greet():\n    return "hello"\n');
  const run=(...args)=>{const result=spawnSync(process.execPath,[bin,...args],{encoding:'utf8',env:{...process.env,BBRAINX_HOME:path.join(dir,'state')}});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);};
  const first=run('up','--root',root);
  assert.equal(first.project,'My-Project-v2');assert.equal(first.files,1);assert.equal(first.changed,1);
  assert.deepEqual(Object.keys(first.next.connect),[...CLIENTS]);assert.match(first.next.connect.codex,/config --project My-Project-v2 --client codex$/);
  const again=run('up','--root',root,'--project','another-name');
  assert.equal(again.project,'My-Project-v2','the folder keeps the name it already has');assert.equal(again.changed,0);
  assert.equal(run('search','--project','My-Project-v2','--query','greet').items[0].path,'main.py');
});
