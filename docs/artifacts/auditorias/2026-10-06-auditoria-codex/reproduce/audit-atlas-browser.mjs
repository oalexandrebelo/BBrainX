import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.atlas.config.mjs','--configLoader','native','--host','127.0.0.1','--port','4318','--strictPort'],{stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
let browser;
try{
 const deadline=Date.now()+10000;for(;;){try{const r=await fetch('http://127.0.0.1:4318/');if(r.ok)break;}catch{}if(Date.now()>deadline)throw new Error('Preview did not start: '+logs);await new Promise(r=>setTimeout(r,50));}
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1080}}),api=[],errors=[];
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4318/');await page.locator('[data-id="mcp"]').waitFor();
 const before=new URL(page.url()).searchParams.get('node');await page.locator('[data-id="mcp"]').focus();await page.keyboard.press('Enter');await page.waitForTimeout(100);
 const afterCanvasEnter=new URL(page.url()).searchParams.get('node');
 await page.locator('.atlas-node-list').getByRole('button',{name:'Fronteira MCP',exact:true}).focus();await page.keyboard.press('Enter');await page.waitForTimeout(100);
 const afterListEnter=new URL(page.url()).searchParams.get('node');
 await page.screenshot({path:'/private/tmp/bbrainx-audit-20261006/evidence/pr6-static-browser.png',fullPage:true});
 fs.writeFileSync('/private/tmp/bbrainx-audit-20261006/evidence/pr6-static-browser.json',JSON.stringify({observedAt:new Date().toISOString(),builtStaticOnly:true,before,afterCanvasEnter,canvasKeyboardSelectedMcp:afterCanvasEnter==='mcp',afterListEnter,listKeyboardSelectedMcp:afterListEnter==='mcp',apiRequests:api,pageErrors:errors,scope:'One local Chromium page, real static-only artifact, keyboard probe; not a complete accessibility audit.'},null,2)+'\n');
}finally{await browser?.close();server.kill('SIGTERM');}
