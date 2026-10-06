import test from 'node:test';
import assert from 'node:assert/strict';
import {components,views,stages,sources,graphFor,visibleComponents,revision,evidence} from '../web/atlas/data.js';
import {exportDocument,exportSvg} from '../web/atlas/export.js';

test('atlas: componentes e percursos têm IDs únicos',()=>{
 assert.equal(new Set(components.map(c=>c.id)).size,components.length);
 assert.equal(new Set(views.map(v=>v.id)).size,views.length);
 assert.equal(components.length,32);assert.equal(views.length,5);
});
test('atlas: todo componente tem maturidade, fonte e gate explícitos',()=>{
 for(const c of components){assert.ok(stages[c.status]);assert.ok(sources[c.source]);for(const field of ['title','why','limit','gate','layer'])assert.ok(c[field].length>3);if(c.code)assert.ok(c.code.includes(revision));}
 for(const s of Object.values(sources))assert.equal(new URL(s.url).protocol,'https:');
});
test('atlas: relações e componentes de todos os percursos são válidos',()=>{
 const all=new Set(components.map(c=>c.id)),seen=new Set();
 for(const v of views){assert.equal(new Set(v.ids).size,v.ids.length);const ids=new Set(v.ids);for(const id of ids){assert.ok(all.has(id));seen.add(id);}assert.equal(new Set(v.links.map(e=>e.id)).size,v.links.length);for(const e of v.links){assert.ok(ids.has(e.source)&&ids.has(e.target));assert.notEqual(e.source,e.target);}}
 assert.equal(seen.size,all.size);
});
test('atlas: runtime não promove propostas a integração existente',()=>{
 for(const n of graphFor('runtime').nodes)assert.ok(['shipped','optional'].includes(n.data.status));
 assert.equal(components.find(c=>c.id==='laya').status,'optional');
 assert.equal(components.find(c=>c.id==='cache').status,'candidate');
 assert.equal(components.find(c=>c.id==='unsafe').status,'excluded');
 for(const id of ['supertokens','infisical','medusa','signoz','unkey'])assert.equal(components.find(c=>c.id===id).status,'reference');
});
test('atlas: filtros jamais deixam relações órfãs',()=>{
 for(const view of views)for(const status of ['all',...Object.keys(stages)])for(const query of ['', 'Laya','memoria','zzzz-no-match']){
  const g=graphFor(view.id,status,query),ids=new Set(g.nodes.map(n=>n.id));for(const e of g.edges)assert.ok(ids.has(e.source)&&ids.has(e.target));
 }
});
test('atlas: busca ignora acentos e casos, estado vazio é explícito',()=>{
 assert.deepEqual(visibleComponents('governance','all','AUTORIZAÇÃO'),visibleComponents('governance','all','autorizacao'));
 assert.ok(visibleComponents('governance','all','autorizacao').some(c=>c.id==='authz'));
 assert.equal(graphFor('target','all','zzzz-no-match').nodes.length,0);
 assert.equal(graphFor('unknown').view.id,'target');
});
test('atlas: toda relação planejada permanece documental',()=>{
 for(const v of views)for(const e of graphFor(v.id).edges){const expected=e.kind==='reference'||[e.source,e.target].some(id=>!['shipped','optional'].includes(components.find(c=>c.id===id).status));assert.equal(e.documentedOnly,expected);}
});
test('atlas: exportação determinística preserva revisão e status',()=>{
 const one=exportDocument('target'),two=exportDocument('target');assert.deepEqual(one,two);
 assert.equal(one.inspectedRevision,revision);assert.equal(one.classification,'documentary-architecture-not-runtime-telemetry');
 assert.equal(one.nodes.length,16);assert.equal(exportDocument('laya','candidate').nodes.length,3);
});
test('atlas: SVG faz escape de texto, não incorpora script nem URLs remotas',()=>{
 const doc=exportDocument('laya');doc.title='<script>alert("x")</script> &';doc.nodes[0].data={...doc.nodes[0].data,title:'<image href="bad"/>'};
 const svg=exportSvg(doc);assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('<image '));assert.ok(!svg.includes('foreignObject'));assert.ok(svg.startsWith('<svg'));
});
test('atlas: evidências anteriores ficam separadas e sem total enganoso',()=>{
 assert.deepEqual(evidence.map(e=>e.value),['96','43','35']);assert.equal(evidence[0].url,sources.ci.url);
 assert.match(evidence[1].note,/não executados/);assert.match(evidence[2].note,/Sem Laya/);
});
