import React,{useCallback,useEffect,useRef,useState} from 'react';
import './control-panel.css';

const moneyLabel=(rows,basis)=>{
 const matches=(rows||[]).filter(row=>row.basis===basis);
 if(!matches.length)return 'Desconhecido';
 return matches.map(row=>`${row.currency} ${row.amount} · ${row.calls} chamadas`).join(' · ');
};
const fmt=value=>value===null||value===undefined?'Desconhecido':typeof value==='number'?new Intl.NumberFormat('pt-BR').format(value):String(value);
const date=value=>value?new Date(value).toLocaleString('pt-BR'):'Sem registro';
const shellQuote=value=>"'"+String(value??'').replaceAll("'", "'\\''")+"'";
const checkpoint=task=>task?.content||task||{};
const runLabel={running:'Em andamento',passed:'Aprovado',failed:'Falhou',cancelled:'Cancelado',timed_out:'Tempo esgotado'};
const activityLabel={starting:'Aguardando handshake',connected:'Conectado',closed:'Encerrado',stale:'Sem atualização'};
const coverageValue=value=>value===null||value===undefined?'Desconhecida':typeof value==='boolean'?value?'Sim':'Não':typeof value==='object'?null:String(value);
const coverageLabels={activity:'Atividade',tests:'Testes',retention:'Histórico',costs:'Custos',sessionLeaseMs:'Validade da presença (ms)',truncated:'Leitura limitada',invalidRecords:'Registros inválidos'};
const evidenceText=item=>typeof item==='string'?item:item.path||item.product||item.kind||'Origem não informada';

export default function ControlPanel({boot}){
 const projects=boot?.projects||[];
 const [project,setProject]=useState(projects[0]?.id||'');
 const [report,setReport]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [auto,setAuto]=useState(false),[refreshKey,setRefreshKey]=useState(0);
 const active=useRef(null),generation=useRef(0),loadRef=useRef(null);

 useEffect(()=>{if(!projects.some(item=>item.id===project))setProject(projects[0]?.id||'');},[projects,project]);
 const load=useCallback(async id=>{
  if(!id)return;
  active.current?.abort();const controller=new AbortController(),current=++generation.current;active.current=controller;
  setLoading(true);setError('');
  try{
   const response=await fetch('/api/control?project='+encodeURIComponent(id),{signal:controller.signal,cache:'no-store'});
   const body=await response.json();if(!response.ok)throw new Error(body.error||'Falha ao carregar o projeto.');
   if(current===generation.current&&body.project?.id===id)setReport(body);
   else if(current===generation.current)throw new Error('A resposta não corresponde ao projeto selecionado.');
  }catch(cause){if(cause.name!=='AbortError'&&current===generation.current){setReport(null);setError(cause.message||'Falha ao carregar o projeto.');}}
  finally{if(current===generation.current)setLoading(false);}
 },[]);
 loadRef.current=load;
 useEffect(()=>{
  if(!project){setReport(null);return;}
  load(project);
  return()=>{active.current?.abort();generation.current++;};
 },[project,refreshKey,load]);
 useEffect(()=>{
  if(!auto)return;
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible'&&project)loadRef.current?.(project);},5000);
  return()=>window.clearInterval(timer);
 },[auto,project]);
 function selectProject(event){active.current?.abort();generation.current++;setReport(null);setError('');setLoading(false);setProject(event.target.value);}
 function refresh(){setReport(null);setRefreshKey(value=>value+1);}

 const control=report?.usage||{},usage=control.usage||{},tasks=report?.tasks||[],runs=report?.runs||[],activity=report?.activity||[],lanes=report?.workspaces?.lanes||[];
 const runningRuns=runs.filter(run=>run.status==='running').length;
 const failedRuns=runs.filter(run=>run.status==='failed').length;
 const connected=activity.filter(item=>item.status==='connected').length;
 const reported=moneyLabel(usage.money,'reported'),estimated=moneyLabel(usage.money,'estimated');
 const selected=projects.find(item=>item.id===project),root=report?.project?.root||selected?.root||'';
 const installCommand=`bbrainx integrate --root ${shellQuote(root)} --project ${shellQuote(project)} --apply`;
 const memories=report?.memories||{};
 const coverage=Object.entries(report?.coverage||{}).map(([key,value])=>[key,coverageValue(value)]).filter(([,value])=>value!==null);

 return <section className="control-page" aria-labelledby="control-title">
  <header className="control-header">
   <a className="control-brand" href="/" aria-label="BBrainX início"><img src="/brand/icon.svg" alt=""/><span>BBrainX <small>PAINEL DO PROJETO</small></span></a>
   <div className="control-actions">
    <label className="control-refresh-toggle"><input type="checkbox" checked={auto} onChange={event=>setAuto(event.target.checked)}/> Atualizar a cada 5 s</label>
    <button type="button" className="control-button" onClick={refresh} disabled={!project||loading}>{loading?'Atualizando…':'Atualizar agora'}</button>
   </div>
  </header>
  <section className="control-intro">
   <div><p className="control-eyebrow">CONTINUIDADE / ATIVIDADE / EVIDÊNCIA</p><h1 id="control-title">Painel do projeto</h1><p className="control-description">Acompanhe checkpoints declarados, conexões observadas, testes reportados e uso importado.</p></div>
   <label className="control-project">PROJETO<select aria-label="Projeto" value={project} onChange={selectProject} disabled={!projects.length}>{projects.map(item=><option key={item.id} value={item.id}>{item.id}</option>)}</select></label>
  </section>
  {!projects.length?<p className="control-empty" role="status">Nenhum projeto registrado. Registre um projeto para consultar o painel.</p>:null}
  {error?<p className="control-error" role="alert">{error}</p>:null}
  {loading&&!report?<p className="control-loading" role="status" aria-live="polite">Carregando dados locais do projeto…</p>:null}
  {report?<>
   <section className="control-project-meta" aria-label="Identidade do projeto"><span><b>Raiz visível</b><code>{report.project.root}</code></span><span><b>Snapshot</b><code>{report.project.snapshot||'Desconhecido'}</code></span><span><b>Atualizado</b><time>{date(report.generatedAt)}</time></span></section>
   <section className="control-kpis" aria-label="Resumo">
    <article><span>CONEXÕES ATIVAS</span><strong>{activity.length?fmt(connected):'—'}</strong><small>{activity.length?`${activity.length} atividades registradas`:'Desconhecido · sem telemetria'}</small></article>
    <article><span>TESTES EM ANDAMENTO</span><strong>{runs.length?fmt(runningRuns):'—'}</strong><small>{runs.length?`${failedRuns} execuções com falha`:'Desconhecido · sem relatório importado'}</small></article>
    <article><span>CUSTO INFORMADO</span><strong className="control-money">{reported}</strong><small>Recibos finais importados</small></article>
    <article><span>CUSTO ESTIMADO</span><strong className="control-money">{estimated}</strong><small>Tarifas declaradas · não é fatura</small></article>
   </section>
   <div className="control-columns">
    <section className="control-card">
     <div className="control-section-heading"><div><p className="control-eyebrow">ESTADO DECLARADO</p><h2>Checkpoints e workspaces</h2></div><span className="control-count">{tasks.length} tarefas</span></div>
     <p className="control-note">Memórias aprovadas são compartilhadas entre workspaces do mesmo projeto; checkpoints e tarefas de cada lane permanecem separados.</p>
     {tasks.length?<ul className="control-list">{tasks.map((item,index)=>{const data=checkpoint(item);return <li key={item.task||item.id||index}><div className="control-list-top"><strong>{item.task||item.id||'Tarefa'}</strong><span className="control-tag">{data.status||'estado desconhecido'} · v{item.version??'?'}</span></div><p>{data.nextAction||'Próxima ação desconhecida.'}</p><small>Atualizado {date(item.updated)}</small></li>;})}</ul>:<p className="control-empty" role="status">Nenhum checkpoint registrado.</p>}
     {lanes.length?<div className="control-lanes"><h3>Lanes e workspaces</h3>{lanes.map(lane=><article key={lane.id}><div className="control-list-top"><strong>{lane.id}</strong><span className="control-tag">{lane.state||'estado desconhecido'}</span></div><p>{lane.root||'Raiz desconhecida'} · época {fmt(lane.epoch)} · snapshot {lane.snapshot?lane.snapshot.slice(0,12):'desconhecido'}</p><small>{lane.tasks?.length||0} tarefas no workspace</small></article>)}</div>:<p className="control-note">Nenhum workspace de lane registrado.</p>}
     <p className="control-memory">Memórias: {fmt(memories.approved)} aprovadas · {fmt(memories.proposed)} propostas.</p>
    </section>
    <section className="control-card">
     <div className="control-section-heading"><div><p className="control-eyebrow">HARNESS / MCP</p><h2>Atividade observada</h2></div><span className="control-count">{activity.length}</span></div>
     <p className="control-note">A conexão só aparece como ativa quando uma atividade observada confirma o estado. Configuração detectada não significa processo em execução.</p>
     {activity.length?<ul className="control-list">{activity.map(item=><li key={item.id}><div className="control-list-top"><strong>{item.harness||'Harness desconhecido'}</strong><span className={'control-tag state-'+item.status}>{activityLabel[item.status]||item.status}</span></div><p>{item.workspace||'Workspace desconhecido'}{item.lane?` · lane ${item.lane}`:''}</p><small>{fmt(item.calls)} chamadas · {fmt(item.failures)} falhas · visto {date(item.lastSeen)}</small>{item.lastError?<p className="control-failure">{item.lastError}</p>:null}</li>)}</ul>:<p className="control-empty" role="status">Nenhuma atividade instrumentada neste projeto.</p>}
    </section>
   </div>
   <section className="control-card" aria-label="Orçamento de APIs">
    <div className="control-section-heading"><div><p className="control-eyebrow">ORÇAMENTO / RECIBOS</p><h2>Limite de acompanhamento</h2></div></div>
    {report.budget?.configured?<><p>{report.budget.currency} {report.budget.amount} · {report.budget.basis==='reported'?'custo informado':'custo estimado'}</p><p className={report.budget.status==='reached'?'control-failure':'control-note'}>Observado: {fmt(report.budget.observedAmount)} · saldo sobre recibos: {fmt(report.budget.remainingObserved)} · {report.budget.status==='reached'?'Limite atingido':report.budget.status==='within-imported'?'Dentro do limite dos recibos':report.budget.status==='partial'?'Cobertura parcial':'Consumo desconhecido'}</p><p className="control-note">{report.budget.coverage}</p></>:<p className="control-empty">Sem limite configurado. Defina moeda, valor e base com <code>bbrainx budget --project {project} --amount 50 --currency USD --basis reported --version 0</code>.</p>}
    <p className="control-note">Acumulado dos recibos importados. Este alerta não bloqueia chamadas feitas pelos harnesses nem controla faturas externas.</p>
   </section>
   <section className="control-card control-runs">
    <div className="control-section-heading"><div><p className="control-eyebrow">EXECUÇÕES / TESTES</p><h2>Progresso e falhas</h2></div><span className="control-count">{runs.length} relatórios</span></div>
    {runs.length?<div className="control-run-list">{runs.map(run=><article key={run.id}><div className="control-list-top"><strong>{run.task||run.id} · {run.harness||'runner desconhecido'}</strong><span className={`control-tag state-${run.status}`}>{runLabel[run.status]||run.status}</span></div><div className="control-run-meta"><span>Progresso <b>{fmt(run.completed)} / {run.total===null?'<progresso desconhecido>':fmt(run.total)}</b></span><span>Passaram <b>{fmt(run.passed)}</b></span><span>Falharam <b>{fmt(run.failed)}</b></span><span>Exit code <b>{fmt(run.exitCode)}</b></span></div>{run.total>0?<progress aria-label={`Progresso de ${run.task||run.id}`} max={run.total} value={Math.min(run.completed||0,run.total)}/>:null}<p className="control-note">Revisão {run.revision||'desconhecida'} · início {date(run.startedAt)} · fim {date(run.finishedAt)}</p>{run.failures?.length?<ul className="control-failures">{run.failures.map((failure,index)=><li key={index}><b>{failure.name||'Falha'}</b><span>{failure.message||'Detalhe indisponível.'}</span></li>)}</ul>:null}</article>)}</div>:<p className="control-empty" role="status">Nenhum relatório de testes importado. Progresso e falhas são desconhecidos.</p>}
   </section>
   <section className="control-card control-coverage" aria-label="Cobertura dos dados"><div className="control-section-heading"><div><p className="control-eyebrow">LIMITES DOS DADOS</p><h2>Cobertura conhecida</h2></div></div>{coverage.length?<dl>{coverage.map(([key,value])=><div key={key}><dt>{coverageLabels[key]||key.replaceAll('_',' ')}</dt><dd>{value}</dd></div>)}</dl>:<p className="control-empty">Cobertura desconhecida.</p>}</section>
   <section className="control-columns control-bottom">
    <section className="control-card"><div className="control-section-heading"><div><p className="control-eyebrow">USO / CUSTO</p><h2>Observado e estimado</h2></div></div><p>Recibos importados: {fmt(usage.importedCalls)} · tokens totais conhecidos: {fmt(usage.tokens?.totalTokens?.value)}</p><p>Chamadas com tokens desconhecidos: {fmt(usage.tokens?.totalTokens?.unknownCalls)}. Cobertura das chamadas fora da instrumentação: desconhecida.</p><p>Informado: {reported}</p><p>Estimado: {estimated}</p><p className="control-note">Valores importados ou calculados com tarifas fornecidas; moeda e cobertura permanecem explícitas.</p></section>
    <section className="control-card"><div className="control-section-heading"><div><p className="control-eyebrow">INTEGRAÇÕES</p><h2>Clientes detectados</h2></div></div>{report.integrations?.clients?.length?<ul className="control-integrations">{report.integrations.clients.map(client=><li key={client.id}><strong>{client.name}</strong><span>{client.detected?'Detectado':'Não detectado'}</span>{client.evidence?.length?<small>{client.evidence.map(evidenceText).join(' · ')}</small>:null}</li>)}</ul>:<p className="control-empty">Nenhum cliente listado.</p>}{report.integrations?.warnings?.map((warning,index)=><p className="control-note" key={index}>{warning}</p>)}<p className="control-note">Comando sugerido para este projeto. Revise antes de executar:</p><code className="control-command">{installCommand}</code></section>
   </section>
   <footer className="control-footer">Dados locais do projeto · nenhuma conversa privada é coletada pelo painel · atividade e uso sem instrumentação permanecem desconhecidos.</footer>
  </>:null}
 </section>;
}
