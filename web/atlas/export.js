import {graphFor,revision,inspectedAt,stages} from './data.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function exportDocument(view,status='all',query=''){
 const graph=graphFor(view,status,query);
 return {schemaVersion:1,atlasVersion:'1.0',inspectedRevision:revision,inspectedAt,classification:'documentary-architecture-not-runtime-telemetry',view:graph.view.id,title:graph.view.title,note:graph.view.note,filters:{status,query},nodes:graph.nodes,edges:graph.edges,legend:stages};
}
function lines(text,width=32){const words=text.split(/\s+/),out=[];let line='';for(const w of words){if((line+' '+w).trim().length>width&&line){out.push(line);line=w;}else line=(line+' '+w).trim();}if(line)out.push(line);return out;}
/** Exportação vetorial do mesmo dataset. Não captura DOM nem executa URLs. */
export function exportSvg(doc){
 const width=Math.max(640,...doc.nodes.map(n=>n.position.x+316)),height=Math.max(300,...doc.nodes.map(n=>n.position.y+330));
 const nodeById=new Map(doc.nodes.map(n=>[n.id,n]));
 const connectors=doc.edges.map(e=>{const a=nodeById.get(e.source),b=nodeById.get(e.target);if(!a||!b)return '';const x1=a.position.x+160,y1=a.position.y+270,x2=b.position.x+160,y2=b.position.y+118;return `<path d="M${x1} ${y1} C${x1} ${y1+40} ${x2} ${y2-40} ${x2} ${y2}" fill="none" stroke="#627c8b" stroke-width="1.5" ${e.documentedOnly?'stroke-dasharray="6 6"':''} marker-end="url(#arrow)"/>`;}).join('');
 const boxes=doc.nodes.map(n=>{const s=doc.legend[n.data.status],x=n.position.x+32,y=n.position.y+118;return `<g transform="translate(${x},${y})"><rect width="256" height="152" rx="14" fill="#101d28" stroke="${s.color}" stroke-opacity=".65"/><text x="16" y="25" font-size="10" fill="#a5b7c6">${escape(n.data.layer)}</text>${lines(n.data.title,25).slice(0,2).map((line,i)=>`<text x="16" y="${53+i*23}" font-size="17" font-weight="600" fill="#f0f5fa">${escape(line)}</text>`).join('')}<text x="16" y="128" font-size="12" fill="${s.color}">${escape(s.label)}</text></g>`;}).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height+86}" viewBox="0 0 ${width} ${height+86}" role="img"><title>${escape(doc.title)}</title><desc>Atlas documental BBrainX. Status explícitos; não representa execução.</desc><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="#627c8b"/></marker></defs><rect width="100%" height="100%" fill="#091118"/><g font-family="system-ui,sans-serif"><text x="32" y="42" fill="#9cebc3" font-size="14">BBRAINX / GODMODCODE · ATLAS X99</text><text x="32" y="79" fill="#f0f5fa" font-size="25">${escape(doc.title)}</text>${connectors}${boxes}<text x="32" y="${height+34}" fill="#a5b7c6" font-size="12">Base ${escape(doc.inspectedRevision.slice(0,8))} · ${escape(doc.inspectedAt)} · Linhas tracejadas = relações documentais/propostas</text><text x="32" y="${height+58}" fill="#a5b7c6" font-size="12">${escape(doc.nodes.length)} componentes nesta exportação. Maturidade é indicada em cada nó.</text></g></svg>`;
}
export function saveDownload(content,type,filename){
 const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');
 link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
