import {test,expect} from '@playwright/test';
import fs from 'node:fs';
// Executados pela configuração dedicada, sem interceptação de fetch nem respostas simuladas.
test('Contexto computado real, provedor desconhecido e nenhum polling',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let requests=0;page.on('request',r=>{if(r.url().includes('/api/usage'))requests++;});
 await page.goto('/observatory/');await expect(page.locator('#pack-count')).toContainText('3 pacotes');
 await expect(page.locator('#total')).toHaveText('—');await expect(page.locator('#reduced')).not.toHaveText('—');
 const initial=requests;await page.waitForTimeout(350);expect(requests).toBe(initial);expect(errors).toEqual([]);
 await page.screenshot({path:'artifacts/observatory/context-desktop.png',fullPage:true});
});
test('Recibos explicitamente sintéticos verificam fórmula, custo e economia pareada',async({page})=>{
 await page.goto('/observatory/');await page.selectOption('#project','synthetic-receipts');
 await expect(page.locator('#total')).toHaveText('1.900');await expect(page.locator('#cached')).toHaveText('900');
 await expect(page.locator('#pairs')).toContainText('500');await expect(page.locator('#cost')).toContainText('0,022');
 await expect(page.locator('#source-note')).toContainText('Corpus de demonstração');
 await page.screenshot({path:'artifacts/observatory/synthetic-accounting-desktop.png',fullPage:true});
});
test('Exporta e reabre relatório local sem HTML injetado',async({page})=>{
 await page.goto('/observatory/');await expect(page.locator('#export')).toBeEnabled();
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);const file=await download.path();const report=JSON.parse(fs.readFileSync(file,'utf8'));
 expect(report.containsPrompts).toBe(false);report.project='<img src=x onerror=alert(1)>';
 await page.locator('#report-file').setInputFiles({name:'local.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await expect(page.locator('#project')).toContainText('<img');expect(await page.locator('#project img').count()).toBe(0);
});
test('Relatório inválido é recusado sem apagar a visão anterior',async({page})=>{
 await page.goto('/observatory/');await expect(page.locator('#pack-count')).toContainText('3 pacotes');
 await page.locator('#report-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{}')});
 await expect(page.locator('#error')).toBeVisible();await expect(page.locator('#pack-count')).toContainText('3 pacotes');
});
test('Mobile preserva leitura, navegação nativa e ausência de overflow horizontal',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/observatory/');
 await expect(page.locator('#pack-count')).toContainText('3 pacotes');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/observatory/context-mobile.png',fullPage:true});
});
test('Assets próprios permanecem pequenos e não importam framework de animação',async({request})=>{
 const html=await(await request.get('/observatory/')).text();const js=await(await request.get('/observatory/observatory.js')).text();
 expect(html).not.toMatch(/<(script|link)[^>]+(?:src|href)="https?:/);expect(Buffer.byteLength(js)).toBeLessThan(20000);expect(js).not.toContain('requestAnimationFrame');expect(js).not.toContain('setInterval');
});
