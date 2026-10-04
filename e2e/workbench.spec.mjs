import {test,expect} from '@playwright/test';
import fs from 'node:fs';
async function readyGraph(page){
 await expect(page.locator('.react-flow__node')).toHaveCount(12);
 await expect(page.locator('.react-flow__controls')).toBeVisible();
 await expect(page.locator('.react-flow__node').first()).toBeVisible();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
test('architecture explorer, real context, checkpoint and mobile layout',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:/Continuidade sem começar/})).toBeVisible();
 await readyGraph(page);
 await page.getByRole('button',{name:'Percorrer fluxo'}).click();await expect(page.locator('.inspector h2')).toHaveText('Seu harness');
 fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/bbrainx-architecture-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Mapa do estudo',exact:true}).click();
 await expect(page.locator('.tool-node')).toHaveCount(37);await expect(page.locator('.situation-node')).toHaveCount(5);
 await expect(page.locator('.inspector h2')).toHaveText('Busca em dois estágios, pt → en');
 await page.locator('.tool-node',{hasText:'Laya 0.3.26'}).click();
 await expect(page.locator('.inspector h2')).toHaveText('Laya 0.3.26');await expect(page.locator('.inspector')).toContainText('Apache-2.0');await expect(page.locator('.inspector code.activate')).toHaveText('node bin/bbrainx.mjs laya install');
 await page.locator('.tool-node',{hasText:'Dossiê X99'}).click();await expect(page.locator('.inspector')).toContainText('O QUE MUDARIA O VEREDITO');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.screenshot({path:'artifacts/bbrainx-study-map-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Laboratório',exact:true}).click();
 await page.getByRole('button',{name:'Compilar contexto'}).click();await expect(page.locator('.output-pre')).toContainText('BBrainX context pack');
 await expect(page.locator('.output-pre')).toContainText('README.md');
 await expect(page.locator('.result-stats')).toContainText('FONTES VERIFICADAS');
 await page.screenshot({path:'artifacts/bbrainx-workbench-desktop.png',fullPage:true});
 await page.getByRole('button',{name:/Salvar checkpoint/}).click();await expect(page.locator('.output-pre')).toContainText('review_needed');
 await page.getByRole('button',{name:'Estudo',exact:true}).click();await expect(page.getByRole('heading',{name:/Engenharia antes/})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Arquitetura',exact:true}).click();
 await readyGraph(page);
 await page.screenshot({path:'artifacts/bbrainx-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
