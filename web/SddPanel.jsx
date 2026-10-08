import React,{useEffect,useRef,useState} from 'react';

const statusLabels={absent:'Nenhum artefato SDD detectado',partial:'SDD parcial',present:'Artefatos SDD presentes',draft:'Rascunho SDD · revisão pendente'};
const dimensionLabels={objective:'Objetivo',requirements:'Requisitos',architecture:'Arquitetura',acceptance:'Critérios de aceite',tasks:'Tarefas',traceability:'Rastreabilidade'};
const score=value=>Number.isFinite(value)?value+'/100':'Não informado';

function Gaps({items=[]}){
 return items.length?<ul className="sdd-gaps">{items.map((item,index)=><li key={index}>{item}</li>)}</ul>:<p className="sdd-hint">Nenhuma lacuna documental apontada pela rubrica.</p>;
}
function Feature({feature}){
 const trace=feature.traceability;
 return <article className="sdd-feature">
  <header><h4>{feature.id}</h4><span>Cobertura documental: <strong>{score(feature.score)}</strong></span></header>
  <table><caption>Critérios da feature {feature.id}</caption><thead><tr><th scope="col">Critério</th><th scope="col">Cobertura</th><th scope="col">Pontos</th></tr></thead><tbody>{Object.entries(feature.dimensions||{}).map(([key,value])=><tr key={key}><th scope="row">{dimensionLabels[key]||key}</th><td>{value.covered?'Presente':'Ausente'}</td><td>{value.points}/{value.max}</td></tr>)}</tbody></table>
  <h5>Lacunas da feature</h5><Gaps items={feature.gaps}/>
  {trace?<details><summary>Requisitos e referências em tarefas</summary>
   <p className="sdd-hint">Cobertura de IDs: {Number.isFinite(trace.coverageRatio)?new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(trace.coverageRatio):'Sem IDs explícitos para confrontar'}.</p>
   <dl className="sdd-trace">{[['Requisitos encontrados',trace.requirementIds],['Referências em tarefas',trace.taskReferences],['Requisitos sem tarefa',trace.uncoveredRequirementIds],['Referências órfãs',trace.orphanTaskReferences]].map(([label,ids])=><div key={label}><dt>{label}</dt><dd>{ids?.length?ids.join(', '):'Nenhum'}</dd></div>)}</dl>
  </details>:null}
 </article>;
}

export default function SddPanel({boot}){
 const projects=boot?.projects||[];
 const [project,setProject]=useState(projects[0]?.id||''),[busy,setBusy]=useState(null),[error,setError]=useState(''),[result,setResult]=useState(null);
 const active=useRef(null),generation=useRef(0);
 function invalidate(){generation.current++;active.current?.abort();active.current=null;setBusy(null);setError('');setResult(null);}
 function selectProject(value){invalidate();setProject(value);}
 useEffect(()=>{if(!projects.some(item=>item.id===project)){const next=projects[0]?.id||'';if(project!==next)selectProject(next);}},[projects,project]);
 useEffect(()=>()=>{generation.current++;active.current?.abort();},[]);
 const available=!!(boot?.csrf&&project),selected=projects.find(item=>item.id===project);
 async function run(mode){
  if(!available||busy)return;
  invalidate();const controller=new AbortController(),current=++generation.current;active.current=controller;setBusy(mode);
  try{
   const response=await fetch('/api/invoke',{method:'POST',headers:{'Content-Type':'application/json','X-BBrainX-CSRF':boot.csrf},signal:controller.signal,body:JSON.stringify({action:'sdd.align',args:{project,mode}})});
   const body=await response.json();if(controller.signal.aborted||current!==generation.current)return;
   if(!response.ok||!body.ok)throw new Error(body.detail||body.error||'Servidor local indisponível.');
   if(body.data?.project!==project||!Object.hasOwn(statusLabels,body.data?.status)||!Array.isArray(body.data.features)||typeof body.data.completeInspection!=='boolean')throw new Error('Resposta SDD inválida para o projeto selecionado.');
   setResult({data:body.data,mode});
  }catch(cause){if(!controller.signal.aborted&&current===generation.current)setError('Não foi possível avaliar o SDD. '+(cause.message||'Confira o servidor local.'));}
  finally{if(current===generation.current){setBusy(null);active.current=null;}}
 }
 const data=result?.data;
 return <section className="sdd-panel" aria-labelledby="sdd-title">
  <header className="sdd-heading"><span className="eyebrow">ESPECIFICAÇÕES / ALINHAMENTO LOCAL</span><h2 id="sdd-title">SDD · cobertura documental</h2><p>Inspecione as especificações do projeto e suas lacunas. Se não houver artefatos SDD, crie uma base técnica para revisão.</p></header>
  <div className="sdd-controls">
   <label htmlFor="sdd-project">Projeto<select id="sdd-project" aria-label="Projeto" value={project} disabled={!projects.length} onChange={event=>selectProject(event.target.value)}>{projects.map(item=><option key={item.id} value={item.id}>{item.id}</option>)}</select></label>
   {selected?<code className="sdd-root">{selected.root}</code>:<p className="sdd-hint">{boot?'Nenhum projeto registrado. Registre um projeto no CLI.':'Aguardando o servidor local.'}</p>}
   <div className="sdd-actions"><button className="button secondary" disabled={!available||!!busy} onClick={()=>run('assess')}>{busy==='assess'?'Avaliando…':'Avaliar cobertura'}</button><button className="button primary" disabled={!available||!!busy} onClick={()=>run('ensure')}>{busy==='ensure'?'Alinhando…':'Alinhar SDD'}</button>{busy?<button className="button secondary" onClick={invalidate}>Cancelar espera</button>:null}</div>
   <p className="sdd-hint">Avaliar cobertura apenas lê documentos. Alinhar SDD cria <code>SDD.md</code> quando não há artefatos SDD e a inspeção é completa; documentos existentes são preservados.</p>
   <p className="sdd-hint">Cancelar ou trocar de projeto interrompe a espera. Uma criação já concluída permanece no projeto de origem.</p>
  </div>
  <div className="sdd-output" aria-busy={!!busy}>
   <div aria-live="polite" aria-atomic="true">{error?<p className="sdd-notice sdd-warning" role="alert">{error}</p>:busy?<p className="sdd-hint">Inspecionando o projeto {project}…</p>:!data?<p className="sdd-hint">Selecione uma ação para obter o relatório. Abrir este painel não cria documentos.</p>:<h3>{statusLabels[data.status]}</h3>}</div>
   {data?<>
    {data.created?<p className="sdd-notice">Rascunho técnico criado em <code>SDD.md</code>. Revise objetivos, requisitos e critérios de aceite antes de aprovar.</p>:data.status==='draft'?<p className="sdd-notice">Este documento é um rascunho técnico e aguarda revisão humana.</p>:result.mode==='ensure'&&data.status!=='absent'?<p className="sdd-hint">Artefatos existentes preservados. Nenhum SDD adicional foi criado.</p>:null}
    {!data.completeInspection?<p className="sdd-notice sdd-warning" role="status">Inspeção incompleta: a ausência de outros documentos não está comprovada. Confira os limites atingidos; nenhum novo SDD deve ser criado com esta conclusão.</p>:null}
    <section aria-labelledby="sdd-features-title"><h3 id="sdd-features-title">Cobertura por feature</h3>{data.features.length?data.features.map(feature=><Feature key={feature.id} feature={feature}/>):<p className="sdd-hint">Nenhuma feature SDD identificada nesta inspeção.</p>}</section>
    <section className="sdd-summary" aria-labelledby="sdd-score-title"><h3 id="sdd-score-title">Cobertura documental</h3><p className="sdd-score">{score(data.score)}</p><p className="sdd-hint">Rubrica: <code>{data.rubricVersion}</code>. Formatos: {data.formats?.length?data.formats.join(', '):'Nenhum detectado'}.</p><p className="sdd-hint">A nota não mede qualidade semântica, correção do código ou testes aprovados. Um rascunho gerado não é uma especificação aprovada.</p><h4>Lacunas do projeto</h4><Gaps items={data.gaps}/></section>
    <details><summary>Inspeção, limites e fontes</summary><p className="sdd-hint">{data.completeInspection?'Inspeção concluída dentro dos limites declarados.':'Inspeção incompleta.'} Limites atingidos: {data.limits?.reached?.length?data.limits.reached.join(', '):'Nenhum informado'}.</p><pre tabIndex={0}>{JSON.stringify(data.limits,null,2)}</pre><ul className="sdd-sources">{(data.documents||[]).map(doc=><li key={doc.path}><code>{doc.path}</code><span>{doc.kind} · {doc.feature} · {doc.bytes} bytes</span><code>SHA-256 {doc.sha256}</code></li>)}</ul><p className="sdd-hint">Revisão documental: <code>{data.revision?.documentsSha256||'Não informada'}</code></p></details>
    <details><summary>Resposta completa do relatório</summary><pre tabIndex={0}>{JSON.stringify(data,null,2)}</pre></details>
   </>:null}
  </div>
 </section>;
}
