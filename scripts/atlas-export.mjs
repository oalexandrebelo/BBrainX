import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {views,components,stages,revision,inspectedAt} from '../web/atlas/data.js';
import {exportDocument,exportSvg} from '../web/atlas/export.js';
const root=path.resolve('artifacts/atlas');fs.mkdirSync(root,{recursive:true});
for(const v of views){const doc=exportDocument(v.id);fs.writeFileSync(path.join(root,v.id+'.json'),JSON.stringify(doc,null,2)+'\n');fs.writeFileSync(path.join(root,v.id+'.svg'),exportSvg(doc));}
fs.writeFileSync(path.join(root,'architecture-manifest.json'),JSON.stringify({schemaVersion:1,atlasVersion:'1.0',inspectedAt,inspectedRevision:revision,generatedForCommit:process.env.GITHUB_SHA||null,kind:'documentary-atlas',components:components.length,views:views.length,counts:Object.fromEntries(Object.keys(stages).map(s=>[s,components.filter(c=>c.status===s).length])),files:fs.readdirSync(root).filter(f=>/\.(json|svg)$/.test(f)&&f!=='architecture-manifest.json').map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}))},null,2)+'\n');
console.log('Exportadas '+views.length+' visões com revisão e status explícitos.');
