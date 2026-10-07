import React,{memo,useCallback,useEffect,useMemo,useState} from 'react';
import {ReactFlow,ReactFlowProvider,Background,Controls,MiniMap,Handle,Position,useReactFlow,useNodesInitialized,MarkerType} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './atlas.css';
import {revision,inspectedAt,repo,stages,sources,components,views,graphFor,evidence,comparators,gates} from './data.js';
import {exportDocument,exportSvg,saveDownload} from './export.js';

const NODE_WIDTH=256;
const AtlasNode=memo(function AtlasNode({data,selected}){
 const stage=stages[data.status];
 return <div className={'atlas-node'+(selected?' is-selected':'')} style={{'--stage':stage.color}}>
  <Handle type="target" position={Position.Top}/>
  <div className="atlas-node-meta"><span>{data.layer}</span><i aria-hidden="true"/></div>
  <h3>{data.title}</h3><p>{data.why}</p>
  <div className="atlas-node-status"><span>{stage.label}</span><b aria-hidden="true">↗</b></div>
  <Handle type="source" position={Position.Bottom}/>
 </div>;
});
const nodeTypes={atlas:AtlasNode};
function AutoFit({signature}){
 const {fitView}=useReactFlow(),ready=useNodesInitialized();
 useEffect(()=>{if(!ready)return;const timer=requestAnimationFrame(()=>fitView({padding:0.09,maxZoom:1,duration:0}));return()=>cancelAnimationFrame(timer);},[signature,ready,fitView]);return null;
}
function initialState(){
 const p=new URLSearchParams(window.location.search),view=views.some(x=>x.id===p.get('view'))?p.get('view'):'target';
 const status=Object.hasOwn(stages,p.get('status'))?p.get('status'):'all';
 const query=(p.get('q')||'').slice(0,120),graph=graphFor(view,status,query);
 return {view,status,query,selected:graph.nodes.some(n=>n.id===p.get('node'))?p.get('node'):(graph.nodes.find(n=>n.id==='context')?.id||graph.nodes[0]?.id||null)};
}
const Mark=()=> <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M4 12H20A8 8 0 0 1 20 28H4Z M4 36H24A8 8 0 0 1 24 52H4Z M36 12H44L60 52H52Z M52 12H60L44 52H36Z" fill="currentColor"/></svg>;
const External=({href,children,...props})=><a href={href} target="_blank" rel="noreferrer" {...props}>{children}<span aria-hidden="true"> ↗</span></a>;
function AtlasContent(){
 const [state,setState]=useState(initialState),[notice,setNotice]=useState('');
 const graph=useMemo(()=>graphFor(state.view,state.status,state.query),[state.view,state.status,state.query]);
 const selected=graph.nodes.find(n=>n.id===state.selected)?.data||null;
 const connected=useMemo(()=>new Set(graph.edges.filter(e=>e.source===state.selected||e.target===state.selected).flatMap(e=>[e.source,e.target])),[graph.edges,state.selected]);
 const nodes=useMemo(()=>graph.nodes.map(n=>({...n,selected:n.id===state.selected,draggable:false,ariaLabel:n.data.title+' — '+stages[n.data.status].label,style:{width:NODE_WIDTH}})),[graph.nodes,state.selected]);
 const edges=useMemo(()=>graph.edges.map(e=>({...e,type:'smoothstep',animated:false,markerEnd:{type:MarkerType.ArrowClosed,color:e.documentedOnly?'#7f87ae':'#6dac9c'},style:{stroke:e.source===state.selected||e.target===state.selected?'#b9f8d8':e.documentedOnly?'#667195':'#4a776b',strokeWidth:e.source===state.selected||e.target===state.selected?2:1.1,strokeDasharray:e.documentedOnly?'6 6':undefined,opacity:!state.selected||e.source===state.selected||e.target===state.selected?1:0.45}})),[graph.edges,state.selected]);
 const select=useCallback(id=>setState(old=>({...old,selected:id})),[]);
 const nodeClick=useCallback((_,node)=>select(node.id),[select]);
 function change(field,value){setState(old=>{const next={...old,[field]:value};const nextGraph=graphFor(next.view,next.status,next.query);if(!nextGraph.nodes.some(n=>n.id===next.selected))next.selected=nextGraph.nodes[0]?.id||null;return next;});setNotice('');}
 useEffect(()=>{const p=new URLSearchParams();p.set('view',state.view);if(state.status!=='all')p.set('status',state.status);if(state.query)p.set('q',state.query);if(state.selected)p.set('node',state.selected);window.history.replaceState(null,'',window.location.pathname+'?'+p.toString()+window.location.hash);},[state]);
 useEffect(()=>{const fn=()=>setState(initialState());window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);},[]);
 function next(){const at=graph.nodes.findIndex(n=>n.id===state.selected);select(graph.nodes[(at+1)%graph.nodes.length]?.id||null);}
 function download(kind){const data=exportDocument(state.view,state.status,state.query);saveDownload(kind==='json'?JSON.stringify(data,null,2):exportSvg(data),kind==='json'?'application/json':'image/svg+xml','BBrainX-Atlas-X99-'+state.view+'.'+kind);setNotice('Exportação '+kind.toUpperCase()+' concluída.');}
 const counts=Object.fromEntries(Object.keys(stages).map(key=>[key,components.filter(c=>c.status===key).length]));
 return <div className="atlas-shell">
 <a className="atlas-skip" href="#atlas-map">Ir para o mapa</a>
 <header className="atlas-top"><a className="atlas-brand" href="./atlas.html" aria-label="BBrainX Atlas"><Mark/><span>BBrain<span className="mint">X</span><small>GODMODCODE / ATLAS 01</small></span></a><nav aria-label="Seções do atlas"><a href="#atlas-map">Arquitetura</a><a href="#atlas-evidence">Evidências</a><a href="#atlas-comparison">Posicionamento</a></nav><External href={repo} className="atlas-repo">Repositório</External></header>
 <main>
 <section className="atlas-hero"><div><span className="atlas-eyebrow"><i/> ARQUITETURA EVOLUTIVA / MACOS PRIMEIRO</span><h1>Uma memória.<br/><em>Vários harnesses.</em></h1><p>O que roda, o que foi testado isoladamente e o que vem depois. Uma arquitetura que mostra suas evidências — e seus limites.</p></div><aside className="atlas-manifest"><div><span>REVISÃO AUDITADA</span><code>{revision.slice(0,8)}</code></div><div><span>BASE DO PRODUTO</span><strong>0.4.0 <small>developer preview</small></strong></div><div><span>CONTEÚDO DO ATLAS</span><strong>{components.length} <small>componentes · {views.length} percursos</small></strong></div><div className="atlas-manifest-note">Visão documental · {inspectedAt}<br/>Não é telemetria de agentes em execução.</div></aside></section>
 <section className="atlas-map-section" id="atlas-map" aria-label="Atlas da arquitetura">
 <div className="atlas-tabs" role="tablist" aria-label="Percursos de arquitetura">{views.map((v,i)=><button key={v.id} role="tab" aria-selected={state.view===v.id} aria-controls="atlas-panel" onClick={()=>change('view',v.id)}><span>0{i+1}</span>{v.label}</button>)}</div>
 <div className="atlas-toolbar"><label className="atlas-search"><span aria-hidden="true">⌕</span><input aria-label="Buscar componentes" placeholder="Buscar componente, técnica ou camada…" maxLength={120} value={state.query} onChange={e=>change('query',e.target.value)}/>{state.query?<button aria-label="Limpar busca" onClick={()=>change('query','')}>×</button>:null}</label><select aria-label="Filtrar por maturidade" value={state.status} onChange={e=>change('status',e.target.value)}><option value="all">Todas as maturidades</option>{Object.entries(stages).map(([key,s])=><option key={key} value={key}>{s.label}</option>)}</select><div className="atlas-export"><button onClick={()=>download('svg')}>SVG ↓</button><button onClick={()=>download('json')}>JSON ↓</button></div></div>
 <div className="atlas-layout" id="atlas-panel" role="tabpanel">
 <div className="atlas-canvas-card"><div className="atlas-canvas-title"><div><span className="atlas-eyebrow">{String(views.findIndex(v=>v.id===state.view)+1).padStart(2,'0')} / {graph.nodes.length} COMPONENTES NESTA VISÃO</span><h2>{graph.view.title}</h2></div><button className="atlas-guide" onClick={next} disabled={!nodes.length}>Percorrer <span>→</span></button></div><p className="atlas-view-note">{graph.view.note}</p>
 <div className="atlas-canvas" data-testid="atlas-canvas" aria-label="Grafo React Flow da arquitetura">
 {nodes.length?<ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={nodeClick} nodesDraggable={false} nodesConnectable={false} elementsSelectable edgesFocusable={false} minZoom={0.2} maxZoom={1.7} fitView fitViewOptions={{padding:0.09}} colorMode="dark"><Background color="#273441" gap={26} size={1}/><Controls showInteractive={false}/><MiniMap nodeColor={n=>stages[n.data.status].color} maskColor="#091018b0" pannable zoomable/><AutoFit signature={state.view+'|'+state.status+'|'+state.query}/></ReactFlow>:<div className="atlas-empty"><strong>Nenhum componente encontrado.</strong><p>Ajuste a busca ou o filtro de maturidade.</p><button onClick={()=>{setState(old=>({...old,status:'all',query:'',selected:views.find(v=>v.id===old.view).ids[0]}));}}>Limpar filtros</button></div>}
 </div><div className="atlas-canvas-note"><span><i className="atlas-solid"/> relação na base / perfil</span><span><i className="atlas-dashed"/> relação documental ou proposta</span><span>Zoom, seleção e inspeção. Sem executar agentes.</span></div>
 <div className="atlas-node-list" aria-label="Lista acessível dos componentes">{graph.nodes.map(n=><button key={n.id} aria-pressed={state.selected===n.id} onClick={()=>select(n.id)}><i style={{background:stages[n.data.status].color}}/>{n.data.title}</button>)}</div></div>
 <aside className="atlas-inspector" data-testid="atlas-inspector" aria-live="polite">
 {selected?<><div className="atlas-detail-top"><span className="atlas-eyebrow">INSPECIONAR COMPONENTE</span><span className="atlas-badge" style={{color:stages[selected.status].color,borderColor:stages[selected.status].color+'55'}}>{stages[selected.status].label}</span></div><div className="atlas-detail-symbol" style={{color:stages[selected.status].color}}>{String(components.findIndex(c=>c.id===selected.id)+1).padStart(2,'0')}</div><h2>{selected.title}</h2><p className="atlas-stage-explanation">{stages[selected.status].description}</p><dl><dt>POR QUE ESTÁ AQUI</dt><dd>{selected.why}</dd><dt>LIMITE QUE NÃO PODE SER OMITIDO</dt><dd>{selected.limit}</dd><dt>GATE PARA A PRÓXIMA VERSÃO</dt><dd>{selected.gate}</dd></dl><div className="atlas-detail-links"><External href={sources[selected.source].url}>{sources[selected.source].label}</External>{selected.code?<External href={selected.code}>Implementação na base auditada</External>:null}</div><div className="atlas-related"><h3>CONEXÕES NESTA VISÃO</h3>{[...connected].filter(id=>id!==selected.id).map(id=><button key={id} onClick={()=>select(id)}>{components.find(c=>c.id===id).title}<span>↗</span></button>)}{connected.size===0?<p>Sem ligação operacional representada nesta visão.</p>:null}</div></>:<div className="atlas-inspector-empty">Selecione um componente para inspecionar propósito, limite, fonte e próximo gate.</div>}
 </aside></div>
 <div className="atlas-legend" aria-label="Legenda de maturidade">{Object.entries(stages).map(([key,s])=><button key={key} title={s.description} onClick={()=>change('status',state.status===key?'all':key)} aria-pressed={state.status===key}><i style={{background:s.color}}/>{s.label}<b>{counts[key]}</b></button>)}</div><p className="atlas-notice" role="status">{notice||'Status é uma declaração de escopo, não um selo de produção.'}</p>
 </section>
 <section className="atlas-evidence" id="atlas-evidence"><div className="atlas-section-heading"><span className="atlas-eyebrow">EVIDÊNCIAS / POPULAÇÕES DIFERENTES</span><h2>Não somar testes.<br/>Não somar promessas.</h2><p>Três conjuntos anteriores, com revisões e escopos diferentes. Testes deste atlas são registrados separadamente na sua execução de CI.</p></div><div className="atlas-evidence-grid">{evidence.map(e=><article key={e.label}><span>{e.label}</span><div><strong>{e.value}</strong><small>{e.unit}</small></div><p>{e.note}</p>{e.url?<External href={e.url}>Abrir evidência da base</External>:<small>Relatório entregue na auditoria anterior; não é CI da base.</small>}</article>)}</div></section>
 <section className="atlas-comparison" id="atlas-comparison"><div className="atlas-section-heading"><span className="atlas-eyebrow">POSICIONAMENTO / SEM RANKING INVENTADO</span><h2>Promissor. Ainda não<br/><em>liderança comprovada.</em></h2><p>Há um recorte defensável: continuidade local entre harnesses, memória aprovada e decisões Laya verificáveis. Para chamar de “um dos melhores”, faltam comparação de tarefas, operação real e validação externa.</p></div><div className="atlas-comparator-grid">{comparators.map(c=><article key={c.name}><span>{c.area}</span><h3>{c.name}</h3><p>{c.advantage}</p><p className="atlas-gap"><b>Gap a enfrentar</b>{c.gap}</p><External href={sources[c.source].url}>Fonte do projeto</External></article>)}</div><div className="atlas-gates"><h3>O caminho para conquistar reputação</h3>{gates.map((g,i)=><div key={g}><span>{String(i+1).padStart(2,'0')}</span><p>{g}</p></div>)}</div></section>
 </main><footer className="atlas-footer"><span>BBrainX / GODMODCODE · Atlas X99 1.0</span><p>Memória compartilhada não é KV cache universal. O repositório mantém sua visibilidade atual.</p><External href="https://www.alexandrebelo.com.br/">por <strong>AB</strong></External></footer>
 </div>;
}
export function ArchitectureAtlas(){return <ReactFlowProvider><AtlasContent/></ReactFlowProvider>;}
