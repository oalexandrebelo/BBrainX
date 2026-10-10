import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const out='artifacts/consolidated';fs.mkdirSync(out,{recursive:true});
const revision=execFileSync('git',['--no-replace-objects','rev-parse','HEAD'],{encoding:'utf8'}).trim();
const tracked=execFileSync('git',['--no-replace-objects','ls-tree','-r','--name-only','-z',revision,'--','docs','experiments'],{encoding:'utf8'}).split('\0').filter(file=>file.endsWith('.md'));
const files=tracked.sort().map(file=>{
 // Read the committed blob so staged edits and CRLF checkout conversion cannot mislabel HEAD.
 const data=execFileSync('git',['--no-replace-objects','show',revision+':'+file],{maxBuffer:16*1024*1024}),text=data.toString('utf8');
 const sources=[...new Set(text.match(/https?:\/\/[^\s<>"\)\]]+/g)??[])].sort();
 return {file:file.replaceAll('\\','/'),title:text.match(/^#\s+(.+)$/m)?.[1]??path.basename(file),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),sources};
});
const report={schemaVersion:1,kind:'documentary-inventory-not-new-source-verification',revision,documents:files.length,uniqueReferencedUrls:new Set(files.flatMap(f=>f.sources)).size,files};
fs.writeFileSync(path.join(out,'research-catalog.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(out,'research-catalog.md'),'# Catálogo documental da revisão\n\nGerado a partir dos blobs de HEAD, sem alterações locais; referências não foram reconsultadas por este script.\n\n'+files.map(f=>'- ['+f.title.replaceAll('[','(').replaceAll(']',')')+'](https://github.com/oalexandrebelo/BBrainX/blob/'+revision+'/'+f.file.split('/').map(encodeURIComponent).join('/')+') — '+f.bytes+' bytes; SHA-256 `'+f.sha256+'`.').join('\n')+'\n');
console.log(JSON.stringify({documents:report.documents,uniqueReferencedUrls:report.uniqueReferencedUrls,output:out}));
