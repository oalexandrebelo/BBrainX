import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { VERSION } from '../version.mjs';

const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const projectRef=id=>hash(['bbrainx-panel-project-v1',id]);
const isCount=x=>Number.isSafeInteger(x)&&x>=0;
const check=(x,code='INVALID_PANEL_SNAPSHOT')=>{if(!x)throw new Error(code);};
const keys=(o,list)=>{check(o!==null&&typeof o==='object'&&!Array.isArray(o));check(Object.keys(o).length===list.length&&list.every(k=>Object.hasOwn(o,k)));};
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const nullableCount=x=>x===null||isCount(x);
const statusSet=new Set(['starting','connected','closed','stale']);
const knownHarness=new Set(['claude','codex','cursor','vscode','antigravity','gemini','unknown']);
const iso=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;

/** Somente whitelist. Não exporta nomes de projeto, roots, títulos de tarefas, prompts, recibos brutos ou IDs de sessão. */
export function projectPanelSnapshot(overview,{project,revision=null}={}) {
  check(typeof project==='string'&&overview.project?.id===project,'PANEL_PROJECT_MISMATCH');
  const u=overview.usage,token=u.usage.tokens;
  const data={schemaVersion:1,kind:'bbrainx-panel-snapshot',version:VERSION,generatedAt:new Date().toISOString(),projectRef:projectRef(project),
    revision:typeof revision==='string'&&/^[a-f0-9]{40}$/.test(revision)?revision:null,
    snapshot:digest(overview.project.snapshot)?overview.project.snapshot:null,
    connection:'not-observed-offline',memory:{...overview.memories},
    workspaces:{primaryTasks:overview.tasks.length,lanes:overview.workspaces.lanes.slice(0,32).map(l=>({ref:hash([project,l.id]),status:['active','closed'].includes(l.state)?l.state:'unknown',tasks:l.tasks?.length??0}))},
    activity:overview.activity.slice(0,256).map(a=>({harness:knownHarness.has(a.harness)?a.harness:'unknown',stateAtCapture:statusSet.has(a.status)?a.status:'stale',lastSeen:iso(a.lastSeen)?a.lastSeen:null,calls:isCount(a.calls)?a.calls:0,failures:isCount(a.failures)?a.failures:0})),
    tokens:Object.fromEntries(['inputTotal','cacheRead','cacheWrite','outputTotal','totalTokens'].map(k=>[k,{value:token[k].value,knownCalls:token[k].knownCalls,unknownCalls:token[k].unknownCalls,complete:token[k].complete}])),
    groups:u.usage.groups.slice(0,100).map(g=>({ref:hash([g.provider,g.model,g.harness]),harness:knownHarness.has(g.harness)?g.harness:'unknown',calls:g.calls,totalTokens:g.calls>g.unknownTokens?g.totalTokens:null,unknownCalls:g.unknownTokens})),
    costs:u.usage.money.slice(0,40).map(m=>({currency:m.currency,basis:m.basis,amount:m.amount,calls:m.calls,missingCalls:m.missingCalls})),
    context:{packs:u.context.packs,payloadTokens:u.context.payloadTokens,reducedTokens:u.context.reducedTokens,knownPairs:u.context.knownPairs,unknownPairs:u.context.unknownPairs,encoding:'o200k_base'},
    coverage:{importedCalls:u.usage.importedCalls,truncated:overview.coverage.truncated||u.usage.truncated||u.context.truncated||u.usage.groupsTruncated===true||u.usage.moneyTruncated===true||u.usage.pairsTruncated===true||overview.workspaces.lanes.length>32||overview.activity.length>256||u.usage.groups.length>100||u.usage.money.length>40,invalidRecords:overview.coverage.invalidRecords,providerSavings:null,unobservedCalls:null}};
  const result={...data,generation:hash(data)};return validatePanelSnapshot(result,project);
}

/** Recibos são dados não confiáveis. Um digest correto detecta divergência; não autentica o produtor. */
export function validatePanelSnapshot(s,project) {
  keys(s,['schemaVersion','kind','version','generatedAt','projectRef','revision','snapshot','connection','memory','workspaces','activity','tokens','groups','costs','context','coverage','generation']);
  check(s.schemaVersion===1&&s.kind==='bbrainx-panel-snapshot'&&s.connection==='not-observed-offline');
  check(typeof s.version==='string'&&/^\d+\.\d+\.\d+$/.test(s.version)&&iso(s.generatedAt)&&digest(s.projectRef));
  check(s.projectRef===projectRef(project),'PANEL_PROJECT_MISMATCH');
  check(s.revision===null||typeof s.revision==='string'&&/^[a-f0-9]{40}$/.test(s.revision));check(s.snapshot===null||digest(s.snapshot));
  keys(s.memory,['approved','proposed','revoked']);check(Object.values(s.memory).every(isCount));
  keys(s.workspaces,['primaryTasks','lanes']);check(isCount(s.workspaces.primaryTasks)&&Array.isArray(s.workspaces.lanes)&&s.workspaces.lanes.length<=32);
  for(const l of s.workspaces.lanes){keys(l,['ref','status','tasks']);check(digest(l.ref)&&['active','closed','unknown'].includes(l.status)&&isCount(l.tasks));}
  check(Array.isArray(s.activity)&&s.activity.length<=256);
  for(const a of s.activity){keys(a,['harness','stateAtCapture','lastSeen','calls','failures']);check(knownHarness.has(a.harness)&&statusSet.has(a.stateAtCapture)&&(a.lastSeen===null||iso(a.lastSeen))&&isCount(a.calls)&&isCount(a.failures));}
  keys(s.tokens,['inputTotal','cacheRead','cacheWrite','outputTotal','totalTokens']);
  for(const t of Object.values(s.tokens)){keys(t,['value','knownCalls','unknownCalls','complete']);check(nullableCount(t.value)&&isCount(t.knownCalls)&&isCount(t.unknownCalls)&&typeof t.complete==='boolean');check((t.knownCalls===0)===(t.value===null));check(!t.complete||(t.knownCalls>0&&t.unknownCalls===0));}
  check(Array.isArray(s.groups)&&s.groups.length<=100);
  for(const g of s.groups){keys(g,['ref','harness','calls','totalTokens','unknownCalls']);check(digest(g.ref)&&knownHarness.has(g.harness)&&isCount(g.calls)&&nullableCount(g.totalTokens)&&isCount(g.unknownCalls)&&g.unknownCalls<=g.calls);}
  check(Array.isArray(s.costs)&&s.costs.length<=40);
  for(const m of s.costs){keys(m,['currency','basis','amount','calls','missingCalls']);check(/^[A-Z]{3}$/.test(m.currency)&&['reported','estimated'].includes(m.basis)&&typeof m.amount==='string'&&/^\d{1,20}(?:\.\d{1,12})?$/.test(m.amount)&&isCount(m.calls)&&isCount(m.missingCalls));}
  keys(s.context,['packs','payloadTokens','reducedTokens','knownPairs','unknownPairs','encoding']);check(isCount(s.context.packs)&&nullableCount(s.context.payloadTokens)&&(s.context.reducedTokens===null||Number.isSafeInteger(s.context.reducedTokens))&&isCount(s.context.knownPairs)&&isCount(s.context.unknownPairs)&&s.context.encoding==='o200k_base');
  keys(s.coverage,['importedCalls','truncated','invalidRecords','providerSavings','unobservedCalls']);check(isCount(s.coverage.importedCalls)&&typeof s.coverage.truncated==='boolean'&&isCount(s.coverage.invalidRecords)&&s.coverage.providerSavings===null&&s.coverage.unobservedCalls===null);
  const {generation,...data}=s;check(digest(generation)&&hash(data)===generation,'PANEL_GENERATION_MISMATCH');check(Buffer.byteLength(JSON.stringify(s))<=262144,'PANEL_SNAPSHOT_LIMIT');return structuredClone(s);
}
const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=x=>x===null?'Não medido':new Intl.NumberFormat('pt-BR').format(x);
export function renderPanelSnapshot(raw,project) {
  const s=validatePanelSnapshot(raw,project);
  const rows=Object.entries(s.tokens).map(([k,t])=>`<tr><th>${escape(k)}</th><td>${number(t.value)}</td><td>${t.knownCalls}</td><td>${t.unknownCalls}</td><td>${t.complete?'Completa no recorte':'Parcial / desconhecida'}</td></tr>`).join('');
  const money=s.costs.map(m=>`<li>${escape(m.currency)} ${escape(m.amount)} — ${m.basis==='reported'?'reportado':'estimado'}, ${m.calls} chamadas; ${m.missingCalls} sem este valor.</li>`).join('');
  const script=`const at=Date.parse(document.querySelector('time').dateTime);const age=Date.now()-at;document.getElementById('age').textContent=age<0?'Relógio local anterior à captura':Math.floor(age/60000)+' minutos desde a captura. Estado atual não consultado.';`;
  const scriptHash=createHash('sha256').update(script).digest('base64');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"><title>BBrainX — captura local</title><style>body{font:16px system-ui,sans-serif;max-width:1040px;margin:3rem auto;padding:0 1.5rem;background:#f4f6f7;color:#142b36;line-height:1.6}h1{font-size:2.4rem;margin:0}header,section{background:white;border:1px solid #dce3e7;border-radius:12px;padding:1.5rem;margin:1rem 0}small,.muted{color:#506675}strong{font-weight:650}.cards{display:flex;gap:1rem;flex-wrap:wrap}.cards div{flex:1;min-width:170px;border-left:3px solid #2d6961;padding-left:1rem}.cards b{display:block;font-size:1.7rem}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:.6rem;border-bottom:1px solid #e0e6e9}code{overflow-wrap:anywhere;font-size:.8rem}.table{overflow-x:auto}a{color:inherit}@media(prefers-color-scheme:dark){body{background:#121c23;color:#dde9ed}header,section{background:#182730;border-color:#354550}.muted,small{color:#a8bdc7}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}</style></head><body>
<header><small>BBRAINX / LEITURA OFFLINE / METADADOS</small><h1>Otimização com evidência.</h1><p><strong>Captura, não monitor ao vivo.</strong> Nenhum servidor, modelo ou histórico externo é consultado ao abrir este arquivo.</p><time datetime="${escape(s.generatedAt)}">${escape(s.generatedAt)}</time><p id="age" class="muted">Estado atual não consultado. Use a data acima para avaliar a antiguidade.</p><p>Projeto: <code>${s.projectRef.slice(0,16)}</code> · v${escape(s.version)} · Revisão: <code>${s.revision??'não observada'}</code></p></header>
<section class="cards"><div>Pacotes locais<b>${number(s.context.packs)}</b></div><div>Tokens do pacote<b>${number(s.context.payloadTokens)}</b></div><div>Recibos importados<b>${number(s.coverage.importedCalls)}</b></div><div>Redução local pareada<b>${number(s.context.reducedTokens)}</b></div></section>
<section><h2>Tokens observados</h2><p>A reutilização de entrada pelo provedor não significa tokens que deixaram de ser enviados. A redução local é medida em o200k_base, sobre candidatos pareados; não é economia de fatura.</p><div class="table"><table><thead><tr><th>Contador</th><th>Valor</th><th>Chamadas conhecidas</th><th>Desconhecidas</th><th>Cobertura</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section><h2>Grupos de modelo e harness</h2><p>Referências opacas por provedor/modelo/harness; nomes livres de modelos e sessões não são exportados.</p>${s.groups.length?s.groups.map(g=>`<p><code>${g.ref.slice(0,16)}</code> · ${escape(g.harness)} · ${g.calls} chamadas · ${number(g.totalTokens)} tokens conhecidos · ${g.unknownCalls} chamadas com total desconhecido.</p>`).join(''):'<p>Nenhum recibo de modelo neste recorte.</p>'}</section>
<section><h2>Custos e cobertura</h2>${money?'<ul>'+money+'</ul>':'<p><strong>Não medido.</strong> Não há valor monetário observado neste recorte.</p>'}<p>Economia de provedor atribuída ao BBrainX: <strong>não medida</strong>. Chamadas fora da instrumentação: <strong>quantidade desconhecida</strong>.</p><p>Recorte truncado: ${s.coverage.truncated?'sim':'não reportado'}. Registros inválidos: ${s.coverage.invalidRecords}.</p></section>
<section><h2>Continuidade no instante da captura</h2><p>Memórias: ${s.memory.approved} aprovadas, ${s.memory.proposed} propostas, ${s.memory.revoked} revogadas. Conteúdo omitido.</p><p>${s.workspaces.primaryTasks} tarefas no recorte principal; ${s.workspaces.lanes.length} lanes. Conexões observadas no recorte: ${s.activity.length}. <strong>Nenhuma conexão é declarada ativa agora.</strong></p>${s.workspaces.lanes.map(l=>`<p>Lane <code>${l.ref.slice(0,16)}</code>: ${escape(l.status)} na captura, ${l.tasks} tarefas observadas.</p>`).join('')}<p class="muted">IDs opacos reduzem exposição; não constituem anonimização criptográfica. Memória, lanes e recibos são leituras distintas, não uma transação global nem decisão de autorização.</p></section>
<footer><p>Geração: <code>${s.generation}</code></p><p>Atualize com uma nova exportação explícita. Esta página não coleta prompts, respostas ou credenciais e não faz requisições de rede.</p></footer><script>${script}</script></body></html>`;
}

/** Arquivo novo, publicação exclusiva e fsync de conteúdo. Erro não sobrescreve o relatório anterior. */
export function publishPanelSnapshot(file,html) {
  check(typeof html==='string'&&Buffer.byteLength(html)<=524288,'PANEL_HTML_LIMIT');
  const dest=path.resolve(file),parent=fs.realpathSync(path.dirname(dest)),target=path.join(parent,path.basename(dest));
  check(!fs.existsSync(target),'PANEL_OUTPUT_EXISTS');
  const temporary=path.join(parent,'.bbrainx-panel-'+randomUUID()+'.tmp');let fd;
  try{fd=fs.openSync(temporary,'wx',0o600);fs.writeFileSync(fd,html);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.linkSync(temporary,target);}
  finally{if(fd!==undefined)fs.closeSync(fd);fs.rmSync(temporary,{force:true});}
  return {file:target,bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex'),live:false};
}
export async function exportPanelSnapshot(project,file) {
  const {stateHome,gitState}=await import('../host.mjs');
  const home=stateHome();check(fs.existsSync(path.join(home,'brain.sqlite')),'PANEL_STATE_NOT_FOUND');
  const [{BrainStore},{controlOverview}]=await Promise.all([import('../store.mjs'),import('../control.mjs')]);
  const store=new BrainStore(home);
  try{
    const overview=controlOverview(store,project),revision=gitState(fileURLToPath(new URL('../../',import.meta.url))).commit;
    const snapshot=projectPanelSnapshot(overview,{project,revision});
    return {...publishPanelSnapshot(file,renderPanelSnapshot(snapshot,project)),projectRef:snapshot.projectRef,generation:snapshot.generation,generatedAt:snapshot.generatedAt};
  }finally{store.close();}
}

/** Leitura explícita de JSON externo; não modifica bancos e recusa truncamento UTF-8 ou campos inválidos. */
export function readPanelSnapshot(file,project) {
  const before=fs.lstatSync(file);check(before.isFile()&&!before.isSymbolicLink()&&before.size<=262144,'PANEL_INPUT_FILE');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
  try{const opened=fs.fstatSync(fd);check(opened.isFile()&&opened.dev===before.dev&&opened.ino===before.ino,'PANEL_INPUT_CHANGED');
    const b=Buffer.alloc(262145);let used=0;while(used<b.length){const n=fs.readSync(fd,b,used,b.length-used,null);if(!n)break;used+=n;}
    const after=fs.fstatSync(fd);check(used<=262144&&used===opened.size&&after.size===opened.size&&after.mtimeMs===opened.mtimeMs,'PANEL_INPUT_CHANGED');
    return validatePanelSnapshot(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(0,used))),project);
  }finally{fs.closeSync(fd);}
}
