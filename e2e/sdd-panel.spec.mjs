import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

async function openSdd(page){
 await page.goto('/');await page.getByRole('button',{name:'SDD',exact:true}).click();
 await expect(page.getByRole('heading',{name:'SDD · cobertura documental'})).toBeVisible();
}
// Explicit UI contract fixtures. These reports do not claim a real repository inspection.
const report={version:1,project:'demo',status:'absent',created:false,completeInspection:true,score:0,rubricVersion:'sdd-document-coverage-v1',semanticQuality:'not_assessed',formats:[],documents:[],features:[],gaps:['Nenhuma especificação detectada nesta fixture UI.'],limits:{maxDepth:4,maxDocuments:128,maxFileBytes:65536,maxTotalBytes:524288,maxVisitedEntries:2048,reached:[]},revision:{documentsSha256:'ui-fixture-document-hash'}};
const response=data=>({ok:true,data,error:null,detail:null});
async function secondProject(page){
 await page.route('**/api/bootstrap',async route=>{
  const result=await route.fetch(),body=await result.json();
  body.projects.push({id:'ui-fixture-second',root:'/ui-fixture/second'});await route.fulfill({response:result,json:body});
 });
}

test('servidor real abre sem criação implícita e avalia demo somente para leitura',async({page,request},testInfo)=>{
 const boot=await (await request.get('/api/bootstrap')).json(),demo=boot.projects.find(item=>item.id==='demo');
 const file=path.join(demo.root,'SDD.md');expect(fs.existsSync(file)).toBe(false);
 const calls=[],errors=[];page.on('request',req=>{if(req.url().endsWith('/api/invoke'))calls.push(req.postDataJSON());});page.on('pageerror',error=>errors.push(error.message));
 await openSdd(page);await expect(page.locator('.sdd-output')).toContainText('Abrir este painel não cria documentos');expect(calls).toEqual([]);
 await page.getByRole('button',{name:'Avaliar cobertura',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Nenhum artefato SDD detectado'})).toBeVisible();
 expect(calls).toEqual([{action:'sdd.align',args:{project:'demo',mode:'assess'}}]);expect(fs.existsSync(file)).toBe(false);
 await expect(page.locator('.sdd-summary')).toContainText('Cobertura documental');
 await expect(page.locator('.sdd-summary')).toContainText('não mede qualidade semântica');
 for(const width of [1440,1024,768,320]){
  await page.setViewportSize({width,height:1080});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 }
 await page.screenshot({path:testInfo.outputPath('sdd-real-assess-mobile.png'),fullPage:true});expect(errors).toEqual([]);
});

test('fixture UI envia ensure explícito e distingue rascunho criado de revisão humana',async({page})=>{
 let submitted;await page.route('**/api/invoke',route=>{submitted=route.request().postDataJSON();return route.fulfill({json:response({...report,status:'draft',created:true,score:49,formats:['generic'],gaps:['Revisão humana pendente.']})});});
 await openSdd(page);await page.getByRole('button',{name:'Alinhar SDD',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Rascunho SDD · revisão pendente'})).toBeVisible();
 expect(submitted).toEqual({action:'sdd.align',args:{project:'demo',mode:'ensure'}});
 await expect(page.locator('.sdd-output')).toContainText('Rascunho técnico criado em SDD.md');
 await expect(page.locator('.sdd-score')).toHaveText('49/100');
 await expect(page.locator('.sdd-summary')).toContainText('não é uma especificação aprovada');
});

test('fixture UI mostra features separadas, rubrica, lacunas e hashes',async({page},testInfo)=>{
 const dimensions={objective:{covered:true,points:15,max:15},requirements:{covered:true,points:20,max:20},tasks:{covered:false,points:0,max:15},traceability:{covered:false,points:0,max:15}};
 const traceability={requirementIds:['FR-001'],taskReferences:['FR-999'],coveredRequirementIds:[],uncoveredRequirementIds:['FR-001'],orphanTaskReferences:['FR-999'],coverageRatio:0};
 const data={...report,status:'partial',score:35,formats:['spec-kit'],documents:[{path:'specs/ui-fixture/spec.md',sha256:'a'.repeat(64),bytes:123,kind:'spec',feature:'ui-fixture-a'}],features:[{id:'ui-fixture-a',score:35,dimensions,gaps:['FR-001 sem tarefa.'],traceability},{id:'ui-fixture-b',score:0,dimensions:{requirements:{covered:false,points:0,max:20}},gaps:['Feature B sem requisitos.'],traceability:{...traceability,requirementIds:[],taskReferences:[],uncoveredRequirementIds:[],orphanTaskReferences:[],coverageRatio:null}}],gaps:['Features não emprestam cobertura entre si.']};
 await page.route('**/api/invoke',route=>route.fulfill({json:response(data)}));await openSdd(page);
 await page.getByRole('button',{name:'Alinhar SDD',exact:true}).click();
 await expect(page.locator('.sdd-output')).toContainText('Artefatos existentes preservados');
 await expect(page.locator('.sdd-feature')).toHaveCount(2);
 const feature=page.locator('.sdd-feature').first();await expect(feature).toContainText('35/100');await expect(page.locator('.sdd-feature').last()).toContainText('0/100');
 await expect(feature.getByRole('row',{name:'Tarefas Ausente 0/15'})).toBeVisible();
 await feature.getByText('Requisitos e referências em tarefas',{exact:true}).click();
 await expect(feature.locator('.sdd-trace')).toContainText('FR-001');await expect(feature.locator('.sdd-trace')).toContainText('FR-999');
 await expect(page.locator('.sdd-summary')).toContainText('sdd-document-coverage-v1');
 await page.getByText('Inspeção, limites e fontes',{exact:true}).click();
 await expect(page.locator('.sdd-sources')).toContainText('specs/ui-fixture/spec.md');await expect(page.locator('.sdd-sources')).toContainText('a'.repeat(64));
 await page.setViewportSize({width:320,height:1080});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('sdd-feature-ui-fixture-mobile.png'),fullPage:true});
});

test('fixture UI sinaliza inspeção incompleta e erro sem declarar documento criado',async({page})=>{
 await page.route('**/api/invoke',route=>route.fulfill({json:response({...report,completeInspection:false,limits:{...report.limits,reached:['maxDocuments']}})}));
 await openSdd(page);await page.getByRole('button',{name:'Alinhar SDD',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Inspeção incompleta');await expect(page.locator('.sdd-output')).not.toContainText('Rascunho técnico criado');
 await page.getByText('Inspeção, limites e fontes',{exact:true}).click();await expect(page.locator('.sdd-output')).toContainText('maxDocuments');
 await page.unroute('**/api/invoke');await page.route('**/api/invoke',route=>route.fulfill({json:{ok:false,data:null,error:'SDD_CREATION_RACE',detail:null}}));
 await page.getByRole('button',{name:'Alinhar SDD',exact:true}).click();await expect(page.getByRole('alert')).toContainText('SDD_CREATION_RACE');await expect(page.locator('.sdd-score')).toHaveCount(0);
});

test('fixture UI recusa resposta de projeto diferente e mantém estado offline estável',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/bootstrap',route=>route.fulfill({status:503,json:{error:'UI_FIXTURE_OFFLINE'}}));await openSdd(page);
 await expect(page.getByRole('button',{name:'Avaliar cobertura',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Alinhar SDD',exact:true})).toBeDisabled();
 await page.unroute('**/api/bootstrap');await page.route('**/api/invoke',route=>route.fulfill({json:response({...report,project:'ui-fixture-foreign'})}));await openSdd(page);
 await page.getByRole('button',{name:'Avaliar cobertura',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Resposta SDD inválida para o projeto selecionado');
 expect(errors).toEqual([]);
});

for(const change of ['projeto','sair','cancelar'])test(`fixture UI descarta resposta atrasada ao ${change}`,async({page})=>{
 await secondProject(page);let release,seen;
 const gate=new Promise(resolve=>{release=resolve;}),received=new Promise(resolve=>{seen=resolve;});let count=0;
 await page.route('**/api/invoke',async route=>{count++;seen();await gate;try{await route.fulfill({json:response({...report,status:'draft',created:true,score:49})});}catch{/* Cancelled request from this UI fixture. */}});
 await openSdd(page);await page.getByRole('button',{name:'Alinhar SDD',exact:true}).click();await received;
 if(change==='projeto')await page.getByLabel('Projeto',{exact:true}).selectOption('ui-fixture-second');
 if(change==='sair'){await page.getByRole('button',{name:'Estudo',exact:true}).click();await page.getByRole('button',{name:'SDD',exact:true}).click();}
 if(change==='cancelar')await page.getByRole('button',{name:'Cancelar espera',exact:true}).click();
 release();await page.waitForTimeout(150);await expect(page.locator('.sdd-output')).not.toContainText('Rascunho técnico criado');await expect(page.locator('.sdd-score')).toHaveCount(0);expect(count).toBe(1);
});
