import {test,expect} from '@playwright/test';

async function openLaya(page){
 await page.goto('/');await page.getByRole('button',{name:'Laya',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Laya · decisões locais'})).toBeVisible();
}
async function fillDecision(page){
 await page.getByLabel('Texto para avaliar').fill('O recibo informa cobrança duplicada.');
 await page.getByLabel('Pergunta',{exact:false}).fill('Qual equipe deve analisar o caso?');
 await page.getByLabel('Opção A',{exact:true}).fill('Financeiro');
 await page.getByLabel('Opção B',{exact:true}).fill('Suporte técnico');
}
// UI contract fixtures only: no model inference or claim of model quality.
async function fixtureProfile(page,{installed=true,secondProject=false}={}){
 await page.route('**/api/bootstrap',async route=>{
  const response=await route.fetch(),body=await response.json();
  if(secondProject)body.projects.push({id:'ui-fixture-second',root:'/ui-fixture/second'});
  body.laya={enabled:true,installed,ready:false,calibrated:false,model:{package:'laya 0.3.26',checkpoint:'multilingual',revision:'ui-fixture-revision'}};
  await route.fulfill({response,json:body});
 });
}
const suggestion={ok:true,data:{status:'suggested',answers:{decision:{choice:'A',answer_confidence:.8,probabilities:{A:.8,B:.2}}},truncated:false,stateTokensDropped:0,headTruncated:false,calibrated:false,model:{package:'laya 0.3.26',checkpoint:'multilingual',revision:'ui-fixture-revision'},runtime:{device:'ui-fixture-device'},cache:'miss',workerMs:12,elapsedMs:44},error:null,detail:null};

test('servidor real sem opt-in desativa Laya e formulário cabe em desktop e mobile',async({page,request},testInfo)=>{
 const response=await request.get('/api/bootstrap'),boot=await response.json();
 expect(boot.laya?.enabled||false).toBe(false);
 const errors=[];page.on('pageerror',cause=>errors.push(cause.message));
 await openLaya(page);await expect(page.getByRole('status')).toContainText('Laya está desativado');
 await expect(page.getByRole('status')).toContainText('bbrainx serve --laya');
 await fillDecision(page);await expect(page.getByRole('button',{name:'Avaliar escolha',exact:true})).toBeDisabled();
 await expect(page.getByLabel('Texto para avaliar')).toHaveAttribute('maxlength','4000');
 await expect(page.getByLabel('Pergunta',{exact:false})).toHaveAttribute('maxlength','400');
 for(let at=2;at<6;at++)await page.getByRole('button',{name:'Adicionar opção',exact:true}).click();
 await expect(page.getByRole('button',{name:'Adicionar opção',exact:true})).toBeDisabled();
 await expect(page.getByLabel('Opção F',{exact:true})).toHaveAttribute('maxlength','160');
 for(const width of [1440,768,320]){
  await page.setViewportSize({width,height:1080});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 }
 await page.screenshot({path:testInfo.outputPath('laya-mobile.png'),fullPage:true});
 expect(errors).toEqual([]);
});

test('fixture UI envia decisão com projeto e apresenta sugestão sem ação de execução',async({page},testInfo)=>{
 await fixtureProfile(page);let submitted;
 await page.route('**/api/invoke',async route=>{submitted=route.request().postDataJSON();await route.fulfill({json:suggestion});});
 await openLaya(page);await fillDecision(page);await page.getByRole('button',{name:'Avaliar escolha',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Escolha sugerida'})).toBeVisible();
 expect(submitted.action).toBe('decision.evaluate');expect(submitted.args.project).toBe('demo');
 expect(submitted.args.questions.decision).toEqual({type:'choice',instructions:'Qual equipe deve analisar o caso?',criteria:{A:'Financeiro',B:'Suporte técnico'}});
 await expect(page.locator('.laya-choice')).toHaveText('Financeiro');
 await expect(page.locator('.laya-confidence')).toContainText('Confiança não calibrada');
 await expect(page.locator('.laya-metrics')).toContainText('44 ms');
 await expect(page.locator('.laya-metrics')).toContainText('12 ms');
 await expect(page.getByRole('button',{name:/Executar sugestão|Aplicar escolha/})).toHaveCount(0);
 await page.getByText('Identidade e resposta completa',{exact:true}).click();
 await expect(page.locator('.laya-output pre')).toContainText('ui-fixture-revision');
 for(const width of [1440,1024,320]){
  await page.setViewportSize({width,height:1080});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 }
 await page.screenshot({path:testInfo.outputPath('laya-result-ui-fixture-mobile.png'),fullPage:true});
});

test('UI continua estável sem bootstrap e mostra erro de avaliação da fixture',async({page})=>{
 const errors=[];page.on('pageerror',cause=>errors.push(cause.message));
 await page.route('**/api/bootstrap',route=>route.fulfill({status:503,json:{error:'UI_FIXTURE_OFFLINE'}}));
 await openLaya(page);await expect(page.getByRole('status')).toContainText('Aguardando o servidor local');
 await expect(page.getByRole('button',{name:'Avaliar escolha',exact:true})).toBeDisabled();
 await page.unroute('**/api/bootstrap');await fixtureProfile(page);
 await page.route('**/api/invoke',route=>route.fulfill({json:{ok:false,data:null,error:'UI_FIXTURE_UNAVAILABLE',detail:null}}));
 await openLaya(page);await fillDecision(page);await page.getByRole('button',{name:'Avaliar escolha',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('UI_FIXTURE_UNAVAILABLE');
 await expect(page.getByRole('heading',{name:'Escolha sugerida'})).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('fixture UI diferencia perfil não instalado e abstenção por texto cortado',async({page})=>{
 await fixtureProfile(page,{installed:false});await openLaya(page);
 await expect(page.getByRole('status')).toContainText('Perfil Laya não instalado');
 await expect(page.getByRole('status')).toContainText('bbrainx laya install');
 await expect(page.getByRole('button',{name:'Avaliar escolha',exact:true})).toBeDisabled();
 await page.unroute('**/api/bootstrap');await fixtureProfile(page);
 await page.route('**/api/invoke',route=>route.fulfill({json:{...suggestion,data:{...suggestion.data,status:'abstained',truncated:true,stateTokensDropped:200}}}));
 await openLaya(page);await fillDecision(page);await page.getByRole('button',{name:'Avaliar escolha',exact:true}).click();
 await expect(page.getByRole('heading',{name:'O modelo se absteve'})).toBeVisible();
 await expect(page.locator('.laya-output')).toContainText('não foram lidos integralmente');
 await expect(page.locator('.laya-choice')).toHaveCount(0);
});

for(const change of ['editar','projeto','sair'])test(`fixture UI descarta resposta atrasada ao ${change}`,async({page})=>{
 await fixtureProfile(page,{secondProject:true});let release,seen;
 const gate=new Promise(resolve=>{release=resolve;}),received=new Promise(resolve=>{seen=resolve;});
 await page.route('**/api/invoke',async route=>{
  seen();await gate;
  try{await route.fulfill({json:suggestion});}catch{/* Request cancellation can close this UI fixture route. */}
 });
 await openLaya(page);await fillDecision(page);await page.getByRole('button',{name:'Avaliar escolha',exact:true}).click();await received;
 if(change==='editar')await page.getByLabel('Texto para avaliar').fill('Nova informação, sem a cobrança anterior.');
 if(change==='projeto'){
  await page.getByLabel('Projeto',{exact:true}).selectOption('ui-fixture-second');
  await expect(page.getByLabel('Texto para avaliar')).toHaveValue('');
  await expect(page.getByLabel('Opção A',{exact:true})).toHaveValue('');
 }
 if(change==='sair'){
  await page.getByRole('button',{name:'Estudo',exact:true}).click();
  await page.getByRole('button',{name:'Laya',exact:true}).click();
 }
 release();await page.waitForTimeout(150);
 await expect(page.getByRole('heading',{name:'Escolha sugerida'})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Uma escolha inspecionável'})).toBeVisible();
});
