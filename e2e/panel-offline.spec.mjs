import {test,expect} from '@playwright/test';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {BrainStore} from '../src/store.mjs';import {controlOverview} from '../src/control.mjs';
import {projectPanelSnapshot,renderPanelSnapshot,publishPanelSnapshot} from '../src/panel/offline.mjs';
test('offline metadata remains accessible with all network unavailable',async({page},testInfo)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-panel-browser-'));let store;
 try{
  fs.mkdirSync(path.join(dir,'repo'));store=new BrainStore(path.join(dir,'state'));store.register('test-private-name',path.join(dir,'repo'));
  const s=projectPanelSnapshot(controlOverview(store,'test-private-name'),{project:'test-private-name'}),file=path.join(dir,'report.html');publishPanelSnapshot(file,renderPanelSnapshot(s,'test-private-name'));store.close();store=null;
  const remote=[];page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url());});await page.context().setOffline(true);
  await page.goto(pathToFileURL(file).href);await expect(page.getByRole('heading',{name:'Otimização com evidência.'})).toBeVisible();
  await expect(page.locator('#age')).toContainText('minutos desde a captura');await expect(page.locator('body')).not.toContainText('test-private-name');
  expect(remote).toEqual([]);await page.screenshot({path:testInfo.outputPath('offline-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await expect(page.getByRole('heading',{name:'Tokens observados'})).toBeVisible();await page.screenshot({path:testInfo.outputPath('offline-mobile.png'),fullPage:true});
 }finally{store?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
