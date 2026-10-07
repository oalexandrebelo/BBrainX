import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const out='artifacts/consolidated';fs.mkdirSync(out,{recursive:true});
function walk(dir){if(!fs.existsSync(dir))return [];return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);if(e.isSymbolicLink())throw new Error('RESEARCH_SYMLINK');return e.isDirectory()?walk(p):e.isFile()&&p.endsWith('.md')?[p]:[];});}
const files=[...walk('docs'),...walk('experiments')].sort().map(file=>{
 const data=fs.readFileSync(file),text=data.toString('utf8');
 const sources=[...new Set(text.match(/https?:\/\/[^\s<>"\)\]]+/g)??[])].sort();
 return {file:file.replaceAll('\\','/'),title:text.match(/^#\s+(.+)$/m)?.[1]??path.basename(file),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),sources};
});
const report={schemaVersion:1,kind:'documentary-inventory-not-new-source-verification',documents:files.length,uniqueReferencedUrls:new Set(files.flatMap(f=>f.sources)).size,files};
fs.writeFileSync(path.join(out,'research-catalog.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(out,'research-catalog.md'),'# Catálogo documental da revisão\n\nGerado a partir dos arquivos rastreados; referências não foram reconsultadas por este script.\n\n'+files.map(f=>'- ['+f.title.replaceAll('[','(').replaceAll(']',')')+']('+f.file+') — '+f.bytes+' bytes; SHA-256 `'+f.sha256+'`.').join('\n')+'\n');
console.log(JSON.stringify({documents:report.documents,uniqueReferencedUrls:report.uniqueReferencedUrls,output:out}));
