import { test } from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import { situations, tools } from '../web/study-map.js';
import { layoutStudy, SIZE } from '../web/study-layout.js';
import { renderStudy } from '../scripts/study-doc.mjs';

test('every studied tool has a situation, a reason, evidence and a way forward',()=>{
  const groups=new Set(situations.map(situation=>situation.id)), ids=new Set();
  for(const tool of tools){
    assert.ok(!ids.has(tool.id),'duplicate id '+tool.id);ids.add(tool.id);
    assert.ok(groups.has(tool.group),tool.id+' has an unknown situation');
    assert.ok(['medido','spec','leitura','decisão'].includes(tool.basis),tool.id+' needs the origin of its evidence');
    for(const field of ['name','kind','license','what','why','evidence'])assert.ok(typeof tool[field]==='string'&&tool[field].trim().length>2,tool.id+' is missing '+field);
    assert.match(tool.url,/^https:\/\//,tool.id);
    // Quem está fora diz o que mudaria o veredito; os demais dizem o próximo passo.
    if(tool.group==='out')assert.ok(tool.change&&!tool.next,tool.id+' must say what would change the verdict');
    else assert.ok(tool.next&&!tool.change,tool.id+' must say the next step');
    assert.equal(!!tool.activate,tool.group==='profile',tool.id+': only an activatable profile has a command');
  }
  for(const situation of situations)assert.ok(tools.some(tool=>tool.group===situation.id),'empty situation '+situation.id);
});

test('the map lays every tool inside its situation, without overlap',()=>{
  const nodes=layoutStudy(situations,tools), parents=new Map(nodes.filter(node=>node.type==='situation').map(node=>[node.id,node]));
  assert.equal(nodes.filter(node=>node.type==='tool').length,tools.length);assert.equal(parents.size,situations.length);
  const seen=new Set(), placed=[];
  for(const node of nodes){
    if(node.type==='situation'){seen.add(node.id);continue;}
    assert.ok(seen.has(node.parentId),'a parent must come before its children');
    const parent=parents.get(node.parentId);
    assert.ok(node.position.x>=0&&node.position.y>=SIZE.head&&node.position.x+SIZE.width<=parent.style.width&&node.position.y+SIZE.height<=parent.style.height,node.id+' leaves its situation');
    const box={parent:node.parentId,x:node.position.x,y:node.position.y};
    assert.ok(!placed.some(other=>other.parent===box.parent&&Math.abs(other.x-box.x)<SIZE.width&&Math.abs(other.y-box.y)<SIZE.height),node.id+' overlaps a sibling');placed.push(box);
  }
  const columns=[...parents.values()].sort((a,b)=>a.position.x-b.position.x);
  for(let index=1;index<columns.length;index++)assert.ok(columns[index].position.x>=columns[index-1].position.x+columns[index-1].style.width,'situations must not overlap');
});

test('docs/STUDY_MAP.md is the rendering of the same source the panel uses',()=>{
  // No Windows o Git pode entregar o arquivo com CRLF; o conteúdo é o que importa.
  assert.equal(fs.readFileSync(new URL('../docs/STUDY_MAP.md',import.meta.url),'utf8').replaceAll('\r\n','\n'),renderStudy(),'run: node scripts/study-doc.mjs');
});
