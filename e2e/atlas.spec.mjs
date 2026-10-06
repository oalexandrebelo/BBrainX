import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const out=path.resolve('artifacts/atlas');
const list=page=>page.getByRole('generic',{name:'Lista acessível dos componentes'});
async function loaded(page,count){await expect(page.locator('.react-flow__node-atlas')).toHaveCount(count);await expect(page.locator('.react-flow__node-atlas').first()).toBeVisible();}
async function screenshot(page,name){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,name),fullPage:true,animations:'disabled'});}

test('atlas: renderiza arquitetura sem consultar API, com status e fontes',async({page})=>{
 const errors=[],api=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api.push(r.url());});
 await page.goto('/atlas.html');await loaded(page,16);
 await expect(page.getByRole('heading',{level:1})).toContainText('Vários harnesses.');
 await expect(page.getByTestId('atlas-inspector')).toContainText('Compilador de contexto');
 await expect(page.getByRole('tab',{name:'Arquitetura alvo'})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('.react-flow__attribution')).toBeVisible();
 await screenshot(page,'atlas-target-desktop.png');
 assertEmpty(errors);assertEmpty(api);
});
function assertEmpty(values){expect(values).toEqual([]);}

test('atlas: alterna as cinco visões e inspeciona por lista acessível',async({page})=>{
 await page.goto('/atlas.html');await loaded(page,16);
 const specs=[['Runtime atual',12,'runtime'],['Laya + cache',8,'laya'],['Protocolo X99',12,'governance'],['Novas incorporações',15,'ecosystem']];
 for(const [label,count,id] of specs){await page.getByRole('tab',{name:label}).click();await loaded(page,count);await expect(page).toHaveURL(new RegExp('view='+id));await screenshot(page,'atlas-'+id+'-desktop.png');}
 await page.locator('.atlas-node-list').getByRole('button',{name:'SuperTokens',exact:true}).click();
 await expect(page.getByTestId('atlas-inspector')).toContainText('Referência');
 await expect(page.getByTestId('atlas-inspector')).toContainText('não é uma dependência instalada');
});

test('atlas: filtro e busca não promovem o cache candidato',async({page})=>{
 await page.goto('/atlas.html?view=laya');await loaded(page,8);
 await page.getByLabel('Filtrar por maturidade').selectOption('candidate');await loaded(page,3);
 await page.locator('.atlas-node-list').getByRole('button',{name:'Cache exato de decisões',exact:true}).click();
 await expect(page.getByTestId('atlas-inspector')).toContainText('Desligado por padrão');
 await expect(page.getByTestId('atlas-inspector')).toContainText('Patch candidato');
 await page.getByLabel('Buscar componentes').fill('zzzz-no-match');await expect(page.getByText('Nenhum componente encontrado.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();await loaded(page,8);
});

test('atlas: deep link recupera visão e componente após reload',async({page})=>{
 await page.goto('/atlas.html?view=governance&node=budget');await loaded(page,12);
 await expect(page.getByTestId('atlas-inspector')).toContainText('Reserva de orçamento');
 await page.reload();await expect(page.getByTestId('atlas-inspector')).toContainText('OUTCOME_UNKNOWN');
 await page.getByRole('button',{name:'Percorrer',exact:false}).click();await expect(page).not.toHaveURL(/node=budget/);
});

test('atlas: exporta JSON e SVG da visão selecionada',async({page})=>{
 await page.goto('/atlas.html?view=laya');await loaded(page,8);fs.mkdirSync(out,{recursive:true});
 for(const [button,extension] of [['JSON ↓','json'],['SVG ↓','svg']]){
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();const download=await downloading;
  const file=path.join(out,'download-laya.'+extension);await download.saveAs(file);const value=fs.readFileSync(file,'utf8');
  if(extension==='json'){const doc=JSON.parse(value);expect(doc.nodes.length).toBe(8);expect(doc.view).toBe('laya');expect(doc.inspectedRevision).toMatch(/^a9636e9/);}else expect(value).toContain('<svg');
 }
});

test('atlas: mobile não vaza horizontalmente e mantém inspeção utilizável',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/atlas.html?view=laya&node=cache');await loaded(page,8);
 await expect(page.getByTestId('atlas-inspector')).toContainText('Cache exato de decisões');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await screenshot(page,'atlas-mobile.png');
 await page.locator('.atlas-node-list').getByRole('button',{name:'Laya · decisões locais',exact:true}).click();
 await expect(page.getByTestId('atlas-inspector')).toContainText('Opt-in');
});

