import {test,expect} from '@playwright/test';
import fs from 'node:fs';

test('architecture explorer, real context, checkpoint and mobile layout',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:/Continuidade sem começar/})).toBeVisible();
 await expect(page.locator('.react-flow__node')).toHaveCount(12);
 await page.getByRole('button',{name:'Percorrer fluxo'}).click();await expect(page.locator('.inspector h2')).toHaveText('Seu harness');
 fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/bbrainx-architecture-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Laboratório',exact:true}).click();
 await page.getByRole('button',{name:'Compilar contexto'}).click();await expect(page.locator('.output-pre')).toContainText('BBrainX context pack');
 await expect(page.locator('.output-pre')).toContainText('README.md');
 await expect(page.locator('.result-stats')).toContainText('FONTES VERIFICADAS');
 await page.screenshot({path:'artifacts/bbrainx-workbench-desktop.png',fullPage:true});
 await page.getByRole('button',{name:/Salvar checkpoint/}).click();await expect(page.locator('.output-pre')).toContainText('review_needed');
 await page.getByRole('button',{name:'Estudo',exact:true}).click();await expect(page.getByRole('heading',{name:/Engenharia antes/})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Arquitetura',exact:true}).click();
 await page.screenshot({path:'artifacts/bbrainx-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
