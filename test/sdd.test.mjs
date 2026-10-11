import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile,spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {promisify} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {BrainStore} from '../src/store.mjs';
import {hash} from '../src/primitives.mjs';
import {alignSdd} from '../src/sdd.mjs';

const execute=promisify(execFile);
function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-sdd-')),root=path.join(directory,'repo'),home=path.join(directory,'home');
  fs.mkdirSync(root);const store=new BrainStore(home);store.register('sample',root);
  t.after(()=>{store.close();fs.rmSync(directory,{recursive:true,force:true});});
  return {directory,root:store.project('sample').root,home,store};
}
function put(root,name,body){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);return file;}
const objective='## Objetivo e escopo\nPermitir que o usuário encontre documentos do projeto autorizado.\n';
const requirements='## Requisitos\n- **FR-001**: O sistema deve retornar somente os documentos da raiz autorizada.\n';
const architecture='## Arquitetura\nO serviço consulta arquivos locais e entrega resultados pela interface existente.\n';
const acceptance='## Critérios de aceite\nDado um projeto autorizado, a consulta retorna os documentos esperados e seus hashes.\n';
const tasks='## Tarefas\n- T-001 [FR-001]: Implementar a consulta local e verificar a recusa de outra raiz.\n';
const complete=objective+requirements+architecture+acceptance+tasks;

test('assess ausente é somente leitura e rejeita projeto estrangeiro/modo desconhecido',t=>{
  const f=fixture(t),before=fs.readdirSync(f.root);const result=alignSdd(f.store,{project:'sample'});
  assert.equal(result.status,'absent');assert.equal(result.completeInspection,true);assert.equal(result.created,false);assert.equal(result.score,0);
  assert.deepEqual(fs.readdirSync(f.root),before);assert.throws(()=>alignSdd(f.store,{project:'unknown'}));
  assert.throws(()=>alignSdd(f.store,{project:'sample',mode:'write'}),{code:'INVALID_SDD_MODE'});
});
test('ensure cria rascunho exclusivo, declara comandos sem executá-los e preserva bytes na repetição',t=>{
  const f=fixture(t),marker=path.join(f.root,'executed');
  put(f.root,'package.json',JSON.stringify({name:'example',scripts:{test:`node -e "require('fs').writeFileSync('${marker}','bad')"`}}));
  put(f.root,'README.md','# Example\nUma aplicação de exemplo com objetivo declarado, ainda não aprovado.\n');
  const first=alignSdd(f.store,{project:'sample',mode:'ensure'}),bytes=fs.readFileSync(path.join(f.root,'SDD.md'));
  assert.equal(first.created,true);assert.equal(first.status,'draft');assert.equal(first.semanticQuality,'not_assessed');assert.ok(first.score<=49);
  assert.match(bytes.toString(),/BBRAINX_SDD_DRAFT_V1/);assert.match(bytes.toString(),/npm run test/);assert.doesNotMatch(bytes.toString(),/writeFileSync/);
  assert.equal(fs.existsSync(marker),false);assert.equal(first.documents[0].sha256,hash(bytes));
  const second=alignSdd(f.store,{project:'sample',mode:'ensure'});assert.equal(second.created,false);assert.deepEqual(fs.readFileSync(path.join(f.root,'SDD.md')),bytes);
  assert.deepEqual(first.revision,second.revision);
});
test('rubrica genérica cobre seis dimensões com requisitos definidos e tarefas inline',t=>{
  const f=fixture(t);put(f.root,'SPEC.md',complete);const result=alignSdd(f.store,{project:'sample',mode:'ensure'});
  assert.equal(result.status,'present');assert.equal(result.score,100);assert.equal(result.created,false);assert.equal(fs.existsSync(path.join(f.root,'SDD.md')),false);
  assert.deepEqual(result.features[0].traceability.requirementIds,['FR-001']);assert.deepEqual(result.features[0].traceability.coveredRequirementIds,['FR-001']);
  assert.equal(result.semanticQuality,'not_assessed');assert.equal(result.documents[0].path,'SPEC.md');assert.equal('body' in result.documents[0],false);
});
test('menção de ID em tarefa ou aceite não inventa uma definição de requisito',t=>{
  const f=fixture(t);put(f.root,'SPEC.md',objective+requirements+architecture+acceptance.replace('Dado','FR-999: Dado')+tasks.replace('[FR-001]','[FR-001, FR-999]'));
  const feature=alignSdd(f.store,{project:'sample'}).features[0];
  assert.deepEqual(feature.traceability.requirementIds,['FR-001']);assert.deepEqual(feature.traceability.orphanTaskReferences,['FR-999']);assert.equal(feature.dimensions.traceability.covered,false);
});
test('Spec Kit mantém features separadas e governança/plano não prova especificação',t=>{
  const f=fixture(t);put(f.root,'.specify/memory/constitution.md','# Governança\nToda alteração requer revisão de contrato e testes locais.\n');
  put(f.root,'specs/001-search/spec.md',objective+requirements+acceptance);put(f.root,'specs/001-search/plan.md',architecture);
  put(f.root,'specs/002-other/tasks.md','- [ ] T-001 [FR-001]: Implementar a consulta e testar a recusa de outra raiz.\n');
  const result=alignSdd(f.store,{project:'sample'}),first=result.features.find(f=>f.id==='specs:001-search'),other=result.features.find(f=>f.id==='specs:002-other');
  assert.equal(result.status,'present');assert.equal(first.dimensions.traceability.covered,false);assert.deepEqual(first.traceability.uncoveredRequirementIds,['FR-001']);
  assert.deepEqual(other.traceability.orphanTaskReferences,['FR-001']);assert.ok(result.formats.includes('spec-kit'));
  fs.rmSync(path.join(f.root,'specs'),{recursive:true});put(f.root,'specs/001-search/plan.md',architecture);
  const partial=alignSdd(f.store,{project:'sample',mode:'ensure'});assert.equal(partial.status,'partial');assert.equal(partial.created,false);assert.equal(fs.existsSync(path.join(f.root,'SDD.md')),false);
});
test('docs/specs triplet canônico tem a mesma feature; especificação avulsa mantém identidade própria',t=>{
  const f=fixture(t);put(f.root,'docs/specs/spec.md',objective+requirements+acceptance);put(f.root,'docs/specs/plan.md',architecture);put(f.root,'docs/specs/tasks.md',tasks);put(f.root,'docs/specs/custom.md',objective);
  const result=alignSdd(f.store,{project:'sample'});assert.equal(result.features.find(f=>f.id==='docs:project').score,100);assert.ok(result.features.some(f=>f.id==='docs:custom'));
});
test('marcadores estruturais de tarefas Spec Kit preservam a referência real ao requisito',t=>{
  const f=fixture(t);put(f.root,'specs/001-search/spec.md',objective+requirements+acceptance);put(f.root,'specs/001-search/plan.md',architecture);
  put(f.root,'specs/001-search/tasks.md','- [ ] T001 [P] [US1] [FR-001]: Implementar a consulta local e verificar os documentos da raiz autorizada.\n');
  assert.equal(alignSdd(f.store,{project:'sample'}).features[0].score,100);
});
test('títulos vazios, comentários e placeholders inline de templates não recebem cobertura',t=>{
  const f=fixture(t);put(f.root,'SPEC.md',`# [FEATURE NAME]\n## Objective\n[Describe the objective of this feature]\n## Requirements\n- **FR-001**: System MUST [specific capability...]\n## Architecture\n[Describe components and contracts]\n## Acceptance\nGiven [initial state], When [action], Then [outcome]\n## Tasks\n- [ ] T-001 [FR-001]: [Describe implementation task]\n<!-- A sufficiently long comment containing fabricated requirements. -->\n`);
  const result=alignSdd(f.store,{project:'sample'});assert.equal(result.score,0);assert.equal(result.status,'partial');assert.deepEqual(result.features[0].traceability.requirementIds,[]);
  put(f.root,'SPEC.md','## Requisitos\n| Requirement identifier | Functional requirement description |\n| --- | --- |\n| [REQ ID] | [Describe functional requirement here] |\n');
  assert.equal(alignSdd(f.store,{project:'sample'}).score,0);
  put(f.root,'SPEC.md','## Requisitos\n- FR-001: System MUST perform the following very important [capability] actions.\n');
  assert.equal(alignSdd(f.store,{project:'sample'}).score,0);
});
test('README isolado não prova SDD e artefato vazio existente impede criação',t=>{
  const f=fixture(t);put(f.root,'README.md',complete);assert.equal(alignSdd(f.store,{project:'sample'}).status,'absent');
  put(f.root,'SDD.md','');const result=alignSdd(f.store,{project:'sample',mode:'ensure'});assert.equal(result.status,'partial');assert.equal(result.created,false);assert.equal(fs.readFileSync(path.join(f.root,'SDD.md'),'utf8'),'');
});
test('limites de arquivos/bytes/profundidade tornam inspeção incompleta e impedem criação',t=>{
  const f=fixture(t);put(f.root,'SPEC.md','a'.repeat(65537));let result=alignSdd(f.store,{project:'sample',mode:'ensure'});
  assert.ok(result.limits.reached.includes('maxFileBytes'));assert.equal(result.completeInspection,false);assert.equal(fs.existsSync(path.join(f.root,'SDD.md')),false);fs.unlinkSync(path.join(f.root,'SPEC.md'));
  for(let i=0;i<129;i++)put(f.root,`docs/specs/f${i}.md`,'');result=alignSdd(f.store,{project:'sample',mode:'ensure'});assert.equal(result.documents.length,128);assert.ok(result.limits.reached.includes('maxDocuments'));
  fs.rmSync(path.join(f.root,'docs'),{recursive:true});for(let i=0;i<9;i++)put(f.root,`specs/one/${i}.md`,'a'.repeat(65536));result=alignSdd(f.store,{project:'sample'});assert.ok(result.limits.reached.includes('maxTotalBytes'));assert.ok(result.documents.reduce((s,d)=>s+d.bytes,0)<=524288);
  fs.rmSync(path.join(f.root,'specs'),{recursive:true});put(f.root,'specs/a/b/c/spec.md',complete);result=alignSdd(f.store,{project:'sample',mode:'ensure'});assert.ok(result.limits.reached.includes('maxDepth'));assert.equal(result.created,false);
});
test('IDs em excesso são limitados no relatório e explicitam inspeção incompleta',t=>{
  const f=fixture(t);put(f.root,'SPEC.md','## Requisitos\n'+Array.from({length:300},(_,i)=>`- FR-${i}: Deve preservar somente os documentos do projeto autorizado.`).join('\n'));
  const result=alignSdd(f.store,{project:'sample'});assert.ok(result.limits.reached.includes('maxIds'));assert.equal(result.completeInspection,false);assert.equal(result.features[0].traceability.requirementIds.length,256);
  put(f.root,'SPEC.md','## Requisitos\n- FR-'+ 'x'.repeat(300)+': Deve retornar somente os documentos do projeto autorizado.');
  const large=alignSdd(f.store,{project:'sample'});assert.ok(large.limits.reached.includes('maxIdLength'));assert.deepEqual(large.features[0].traceability.requirementIds,[]);
});
test('arquivo symlink é recusado sem ler ou escrever o destino externo',t=>{
  const f=fixture(t),outside=path.join(f.directory,'outside');fs.mkdirSync(outside);const external=put(outside,'SPEC.md',complete);
  try{fs.symlinkSync(external,path.join(f.root,'SDD.md'),'file');}catch(error){if(process.platform==='win32'&&error.code==='EPERM'){t.skip('O host Windows não concede criação de symlinks a este usuário.');return;}throw error;}
  const result=alignSdd(f.store,{project:'sample',mode:'ensure'});assert.equal(result.completeInspection,false);assert.equal(result.created,false);assert.equal(result.documents.length,0);assert.equal(fs.readFileSync(external,'utf8'),complete);
});
test('diretório symlink ou junction é recusado sem ler destino externo',t=>{
  const f=fixture(t),outside=path.join(f.directory,'outside');put(outside,'spec.md',complete);fs.mkdirSync(path.join(f.root,'docs'));fs.symlinkSync(outside,path.join(f.root,'docs','specs'),process.platform==='win32'?'junction':'dir');
  const result=alignSdd(f.store,{project:'sample',mode:'ensure'});assert.equal(result.completeInspection,false);assert.equal(result.documents.length,0);assert.equal(fs.existsSync(path.join(f.root,'SDD.md')),false);assert.equal(fs.readFileSync(path.join(outside,'spec.md'),'utf8'),complete);
});
test('raiz redirecionada não recebe criação',t=>{
  const f=fixture(t),moved=f.root+'-original';fs.renameSync(f.root,moved);fs.symlinkSync(moved,f.root,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>alignSdd(f.store,{project:'sample',mode:'ensure'}),{code:'PROJECT_ROOT_CHANGED'});assert.equal(fs.existsSync(path.join(moved,'SDD.md')),false);
});
test('segredos nomeados e padrões de credenciais não são expostos nem usados na criação',t=>{
  const f=fixture(t),secret='sk-'+ 'x'.repeat(32);put(f.root,'docs/specs/.env',secret);put(f.root,'docs/specs/secret.md',secret);put(f.root,'SPEC.md','## Requisitos\n'+secret);
  const result=alignSdd(f.store,{project:'sample',mode:'ensure'});assert.equal(result.completeInspection,false);assert.equal(result.created,false);assert.equal(result.documents.length,0);assert.equal(JSON.stringify(result).includes(secret),false);assert.equal(fs.existsSync(path.join(f.root,'SDD.md')),false);
});
test('bytes de conteúdo rejeitado também consomem a quota total de leitura',t=>{
  const f=fixture(t),body=('sk-'+ 'x'.repeat(32)).padEnd(65536,' ');for(let i=0;i<9;i++)put(f.root,`docs/specs/document-${i}.md`,body);
  const result=alignSdd(f.store,{project:'sample',mode:'ensure'});assert.ok(result.limits.reached.includes('SDD_CONTENT_REJECTED'));assert.ok(result.limits.reached.includes('maxTotalBytes'));assert.equal(result.documents.length,0);assert.equal(result.created,false);
});
test('fonte de inventário inválida/oversize impede draft e não executa scripts',t=>{
  const f=fixture(t);put(f.root,'package.json','{broken');assert.throws(()=>alignSdd(f.store,{project:'sample',mode:'ensure'}),{code:'SDD_INVENTORY_INCOMPLETE'});assert.equal(fs.existsSync(path.join(f.root,'SDD.md')),false);
  fs.unlinkSync(path.join(f.root,'package.json'));put(f.root,'README.md','a'.repeat(65537));assert.throws(()=>alignSdd(f.store,{project:'sample',mode:'ensure'}),{code:'SDD_INVENTORY_INCOMPLETE'});
});
test('FIFO de artefato é recusado sem bloquear leitura', {skip:process.platform==='win32'},t=>{
  const f=fixture(t),made=spawnSync('mkfifo',[path.join(f.root,'SDD.md')]);assert.equal(made.status,0);
  const start=Date.now(),result=alignSdd(f.store,{project:'sample',mode:'ensure'});assert.equal(result.completeInspection,false);assert.equal(result.created,false);assert.ok(Date.now()-start<2000);
});
test('falha real de gravação parcial remove somente o draft recém-criado', {skip:process.platform==='win32'},async t=>{
  const f=fixture(t),module=pathToFileURL(fileURLToPath(new URL('../src/sdd.mjs',import.meta.url))).href,storeModule=pathToFileURL(fileURLToPath(new URL('../src/store.mjs',import.meta.url))).href;
  const code=`import {BrainStore} from ${JSON.stringify(storeModule)};import {alignSdd} from ${JSON.stringify(module)};process.on('SIGXFSZ',()=>{});const store=new BrainStore(process.argv[1]);try{alignSdd(store,{project:'sample',mode:'ensure'});console.log('unexpected-success');}catch(error){console.log(error.code);}finally{store.close();}`;
  // This limit belongs only to the test child. It makes the regular-file write fail with EFBIG after a partial write.
  const result=await execute('/bin/sh',['-c','ulimit -f 1; exec "$@"','sdd-write-limit',process.execPath,'--input-type=module','-e',code,f.home],{timeout:15000,maxBuffer:8192});
  assert.equal(result.stdout.trim(),'EFBIG');assert.equal(fs.existsSync(path.join(f.root,'SDD.md')),false);assert.deepEqual(fs.readdirSync(f.root),[]);
});
test('duas criações em subprocessos reais produzem um só draft e preservam o hash',async t=>{
  const f=fixture(t),module=fileURLToPath(new URL('../src/sdd.mjs',import.meta.url)),storeModule=fileURLToPath(new URL('../src/store.mjs',import.meta.url));
  const code=`import {BrainStore} from ${JSON.stringify(pathToFileURL(storeModule).href)};import {alignSdd} from ${JSON.stringify(pathToFileURL(module).href)};const store=new BrainStore(process.argv[1]);try{console.log(JSON.stringify(alignSdd(store,{project:'sample',mode:'ensure'})));}finally{store.close();}`;
  const results=await Promise.all([execute(process.execPath,['--input-type=module','-e',code,f.home],{timeout:15000}),execute(process.execPath,['--input-type=module','-e',code,f.home],{timeout:15000})]);
  const reports=results.map(result=>JSON.parse(result.stdout));assert.equal(reports.filter(report=>report.created).length,1);assert.deepEqual(fs.readdirSync(f.root),['SDD.md']);
  const bytes=fs.readFileSync(path.join(f.root,'SDD.md'));assert.match(bytes.toString(),/BBRAINX_SDD_DRAFT_V1/);
  // O_EXCL preserves ownership, not atomic visibility: the noncreator may assess a still-empty draft snapshot.
  assert.equal(reports.find(report=>report.created).documents[0].sha256,hash(bytes));
  assert.equal(alignSdd(f.store,{project:'sample'}).documents[0].sha256,hash(bytes));
});
test('trocas concorrentes de diretório por symlink não aceitam o conteúdo externo',async t=>{
  const f=fixture(t),inside=path.join(f.root,'docs','specs','feature'),held=path.join(f.root,'docs','specs','held'),outside=path.join(f.directory,'outside');
  put(f.root,'docs/specs/feature/spec.md',complete);put(outside,'spec.md','## Requisitos\n- FR-EXTERNAL: Este conteúdo é externo e não pode ser aceito na raiz registrada.\n');
  const externalHash=hash(fs.readFileSync(path.join(outside,'spec.md')));
  // The adversary is a real process. Junctions are available without file-symlink privileges on Windows.
  const code=`const fs=require('fs');const [inside,held,outside]=process.argv.slice(1);let turns=0;function step(){try{fs.renameSync(inside,held);fs.symlinkSync(outside,inside,process.platform==='win32'?'junction':'dir');fs.unlinkSync(inside);fs.renameSync(held,inside);turns++;}catch{try{if(fs.lstatSync(inside).isSymbolicLink())fs.unlinkSync(inside);}catch{}try{if(fs.existsSync(held)&&!fs.existsSync(inside))fs.renameSync(held,inside);}catch{}}if(turns===1)console.log('ready');setImmediate(step);}step();`;
  const child=spawn(process.execPath,['-e',code,inside,held,outside],{stdio:['ignore','pipe','pipe']});const exited=once(child,'exit');
  try{
    await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Directory race fixture did not start')),10000);timer.unref();})]);
    for(let i=0;i<80;i++){
      const result=alignSdd(f.store,{project:'sample'});assert.ok(result.documents.every(document=>document.sha256!==externalHash));assert.equal(JSON.stringify(result).includes('FR-EXTERNAL'),false);
    }
  }finally{child.kill();await exited;}
});
