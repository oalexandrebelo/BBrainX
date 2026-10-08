import {test,expect} from '@playwright/test';

async function openControl(page){
 await page.goto('/');
 await page.getByRole('button',{name:'Painel',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Painel do projeto'})).toBeVisible();
}

test('painel local mostra identidade real do projeto e estados desconhecidos sem recibos',async({page})=>{
 const responseReady=page.waitForResponse(response=>response.url().includes('/api/control?project=demo'));
 await openControl(page);
 const response=await responseReady;expect(response.ok()).toBe(true);
 const payload=await response.json();expect(payload.project.id).toBe('demo');
 await expect(page.locator('.control-project-meta')).toContainText('demo-project');
 await expect(page.getByText('Nenhuma atividade instrumentada neste projeto.')).toBeVisible();
 await expect(page.getByText('Nenhum relatório de testes importado. Progresso e falhas são desconhecidos.')).toBeVisible();
 await expect(page.locator('.control-kpis')).toContainText('Desconhecido');
 await expect(page.locator('.control-command')).toContainText('bbrainx integrate --root');
 await expect(page.locator('.control-integrations')).not.toContainText('[object Object]');
 const detectedPath=payload.integrations.clients.flatMap(client=>client.evidence).find(item=>item.path)?.path;
 if(detectedPath)await expect(page.locator('.control-integrations')).toContainText(detectedPath);
});

test('API do painel recusa projeto que não pertence ao catálogo local',async({request})=>{
 const response=await request.get('/api/control?project=not-registered');
 expect(response.ok()).toBe(false);
 const body=await response.json();expect(body.project).toBeUndefined();
});

test('resposta atrasada do projeto anterior não substitui o projeto selecionado',async({page})=>{
 let releaseFirst,seenFirst;
 const firstGate=new Promise(resolve=>{releaseFirst=resolve;});
 const firstSeen=new Promise(resolve=>{seenFirst=resolve;});
 await page.route(/\/api\/control\?project=demo$/,async route=>{
  seenFirst();await firstGate;
  try{await route.continue();}catch{/* A troca de projeto pode cancelar a requisição antiga. */}
 });
 await openControl(page);await firstSeen;
 const secondResponse=page.waitForResponse(response=>response.url().includes('/api/control?project=demo-second'));
 await page.getByLabel('Projeto',{exact:true}).selectOption('demo-second');
 expect((await secondResponse).ok()).toBe(true);
 await expect(page.locator('.control-project-meta')).toContainText('demo-second');
 releaseFirst();
 await page.waitForTimeout(150);
 await expect(page.locator('.control-project-meta')).toContainText('demo-second');
});
