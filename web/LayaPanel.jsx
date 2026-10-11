import React,{useEffect,useRef,useState} from 'react';

const letters=['A','B','C','D','E','F'];
const percentage=value=>Number.isFinite(value)?new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(value):'Não informada';
const milliseconds=value=>Number.isFinite(value)?new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value)+' ms':'Não informado';

export default function LayaPanel({boot}){
 const projects=boot?.projects||[],profile=boot?.laya;
 const [project,setProject]=useState(projects[0]?.id||'');
 const [state,setState]=useState(''),[instructions,setInstructions]=useState('');
 const [options,setOptions]=useState(['','']);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null);
 const active=useRef(null),generation=useRef(0);
 function invalidate(){generation.current++;active.current?.abort();active.current=null;setBusy(false);setError('');setResult(null);}
 function edit(setter,value){invalidate();setter(value);}
 function selectProject(value){invalidate();setProject(value);setState('');setInstructions('');setOptions(['','']);}
 useEffect(()=>{
  if(!projects.some(item=>item.id===project)){const next=projects[0]?.id||'';if(project!==next)selectProject(next);}
 },[projects,project]);
 useEffect(()=>()=>{generation.current++;active.current?.abort();},[]);

 const available=!!(boot&&profile?.enabled&&profile?.installed&&boot.csrf&&project);
 const complete=state.trim().length>0&&instructions.trim().length>0&&options.every(value=>value.trim().length>0);
 async function evaluate(event){
  event.preventDefault();if(!available||!complete||busy)return;
  invalidate();const controller=new AbortController(),current=++generation.current;active.current=controller;
  const criteria=Object.fromEntries(options.map((value,index)=>[letters[index],value.trim()]));
  setBusy(true);
  try{
   const response=await fetch('/api/invoke',{method:'POST',headers:{'Content-Type':'application/json','X-BBrainX-CSRF':boot.csrf},signal:controller.signal,
    body:JSON.stringify({action:'decision.evaluate',args:{project,state,questions:{decision:{type:'choice',instructions,criteria}}}})});
   const body=await response.json();
   if(controller.signal.aborted||current!==generation.current)return;
   if(!response.ok||!body.ok)throw new Error(body.detail||body.error||'Resposta indisponível.');
   if(!['suggested','abstained'].includes(body.data?.status))throw new Error('Resposta do perfil inválida.');
   if(body.data.status==='suggested'&&!Object.hasOwn(criteria,body.data.answers?.decision?.choice))throw new Error('A escolha não pertence às alternativas enviadas.');
   setResult({data:body.data,criteria});
  }catch(cause){if(!controller.signal.aborted&&current===generation.current)setError('Não foi possível avaliar. '+(cause.message||'Confira o servidor local.'));}
  finally{if(current===generation.current){setBusy(false);active.current=null;}}
 }

 const data=result?.data,answer=data?.answers?.decision;
 const probabilities=Object.entries(answer?.probabilities||{}).filter(([key,value])=>Object.hasOwn(result.criteria,key)&&Number.isFinite(value));
 const selected=projects.find(item=>item.id===project);
 return <section className="laya-panel" aria-labelledby="laya-title">
  <header className="laya-heading"><div><span className="eyebrow">PERFIL OPCIONAL / INFERÊNCIA LOCAL</span><h2 id="laya-title">Laya · decisões locais</h2><p>Forneça um texto e alternativas. O modelo sugere uma escolha; você decide o próximo passo.</p></div><span className="laya-tag">{profile?.enabled?'Opt-in ativado':'Desativado'}</span></header>
  {!boot?<p className="laya-notice" role="status">Aguardando o servidor local. Inicie <code>bbrainx serve --laya</code> para usar este perfil.</p>:
   !profile?.enabled?<p className="laya-notice" role="status">Laya está desativado neste servidor. Inicie <code>bbrainx serve --laya</code> para habilitar as decisões locais.</p>:
   !profile.installed?<p className="laya-notice" role="status">Perfil Laya não instalado. Execute <code>bbrainx laya install</code> no terminal e reinicie <code>bbrainx serve --laya</code>.</p>:
   <p className="laya-notice" role="status">{profile.ready?'Modelo local carregado.':'O modelo será carregado na primeira avaliação; essa chamada pode demorar mais.'}</p>}
  <div className="laya-layout">
   <form onSubmit={evaluate} aria-label="Avaliar decisão local">
    <label htmlFor="laya-project">Projeto<select id="laya-project" aria-label="Projeto" value={project} disabled={!projects.length} onChange={event=>selectProject(event.target.value)}>{projects.map(item=><option key={item.id} value={item.id}>{item.id}</option>)}</select></label>
    {selected?<code className="laya-root">{selected.root}</code>:<p className="laya-hint">Nenhum projeto registrado. Registre um projeto no CLI para avaliar.</p>}
    <label htmlFor="laya-state">Texto para avaliar <span>{state.length}/4.000</span><textarea id="laya-state" rows={7} maxLength={4000} required value={state} onChange={event=>edit(setState,event.target.value)} placeholder="Cole o texto que contém a informação necessária para escolher."/></label>
    <label htmlFor="laya-instructions">Pergunta <span>{instructions.length}/400</span><textarea id="laya-instructions" rows={2} maxLength={400} required value={instructions} onChange={event=>edit(setInstructions,event.target.value)} placeholder="Qual alternativa melhor corresponde ao texto?"/></label>
    <fieldset><legend>Alternativas <small>2 a 6 opções · até 160 caracteres cada</small></legend>
     {options.map((value,index)=><div className="laya-option" key={letters[index]}><label htmlFor={'laya-option-'+letters[index]}>{'Opção '+letters[index]}<input id={'laya-option-'+letters[index]} maxLength={160} required value={value} onChange={event=>edit(setOptions,options.map((old,at)=>at===index?event.target.value:old))}/></label>{options.length>2?<button className="text-button" type="button" aria-label={'Remover opção '+letters[index]} onClick={()=>edit(setOptions,options.filter((_,at)=>at!==index))}>Remover</button>:null}</div>)}
     <button className="text-button" type="button" disabled={options.length===6} onClick={()=>edit(setOptions,[...options,''])}>Adicionar opção</button>
    </fieldset>
    <p className="laya-hint">A escolha não executa ações nem altera memórias. Se o texto ou a pergunta forem cortados, o perfil se abstém.</p>
    <div className="laya-actions"><button className="button primary" type="submit" disabled={!available||!complete||busy}>{busy?'Avaliando localmente…':'Avaliar escolha'}</button>{busy?<button className="button secondary" type="button" onClick={invalidate}>Cancelar avaliação</button>:null}</div>
   </form>
   <div className="laya-output" aria-busy={busy}>
    <div aria-live="polite" aria-atomic="true">
     {error?<p className="laya-error" role="alert">{error}</p>:busy?<p className="laya-hint">Aguardando o modelo local. Editar o formulário cancela esta avaliação.</p>:!data?<><h3>Uma escolha inspecionável</h3><p className="laya-hint">O resultado mostrará a alternativa, a distribuição retornada e os tempos observados.</p></>:null}
     {data?<><span className="laya-tag">{data.status==='suggested'?'Sugestão disponível':'Sem sugestão'}</span><h3>{data.status==='suggested'?'Escolha sugerida':'O modelo se absteve'}</h3>
      {data.status==='suggested'?<p className="laya-choice">{result.criteria[answer?.choice]||'Alternativa não informada'}</p>:<p className="laya-hint">{data.truncated||data.headTruncated?'O texto, a pergunta ou as alternativas não foram lidos integralmente.':'O perfil não produziu uma sugestão utilizável nesta avaliação.'}</p>}
      <p className="laya-confidence">Confiança não calibrada: <strong>{percentage(answer?.answer_confidence)}</strong>. Esse valor não comprova que a escolha está correta.</p>
     </>:null}
    </div>
    {data?<>
     {probabilities.length?<table><caption>Probabilidades retornadas pelo modelo</caption><thead><tr><th scope="col">Alternativa</th><th scope="col">Probabilidade</th></tr></thead><tbody>{probabilities.map(([key,value])=><tr key={key}><th scope="row">{key} · {result.criteria[key]}</th><td>{percentage(value)}</td></tr>)}</tbody></table>:null}
     <dl className="laya-metrics"><div><dt>Tempo total</dt><dd>{milliseconds(data.elapsedMs)}</dd></div><div><dt>Inferência no worker</dt><dd>{milliseconds(data.workerMs)}</dd></div><div><dt>Cache local</dt><dd>{data.cache==='hit'?'Reutilizado':data.cache==='miss'?'Sem reutilização':'Não informado'}</dd></div><div><dt>Dispositivo</dt><dd>{data.runtime?.device||'Não informado'}</dd></div></dl>
     <p className="laya-hint">Tokens do estado omitidos: {Number.isFinite(data.stateTokensDropped)?data.stateTokensDropped:'Não informado'}. Cabeça da pergunta cortada: {data.headTruncated?'sim':'não'}.</p>
     <details><summary>Identidade e resposta completa</summary><pre tabIndex={0}>{JSON.stringify(data,null,2)}</pre></details>
    </>:profile?.model?<p className="laya-hint">{profile.model.package} · {profile.model.checkpoint}<br/><code>{profile.model.revision}</code></p>:null}
   </div>
  </div>
 </section>;
}
