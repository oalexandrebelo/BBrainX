import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Baseline 2.1.1: só a consulta SQL muda; analisador, corpus e segundo estágio são os mesmos.
export const legacySelect="SELECT c.id,c.project,c.path,c.file_hash,c.start_line,c.end_line,c.kind,c.body,c.defs, bm25(chunk_search,2.0, 1.0, 8.0, 1.5) AS rank FROM chunk_search JOIN chunks c ON c.seq=chunk_search.rowid WHERE chunk_search MATCH ? AND c.project=? ORDER BY rank LIMIT ?";
export async function legacyRetrieval(dir){
  const source=new URL('../../src/retrieval.mjs',import.meta.url),body=fs.readFileSync(source,'utf8')
    .replace(/^  const select=store\.stmt\(.*$/m,'  const select=store.stmt('+JSON.stringify(legacySelect)+');')
    .replace(/from '(\.\/[^']+)'/g,(_,relative)=>'from '+JSON.stringify(new URL(relative,source).href));
  const target=path.join(dir,'legacy-retrieval.mjs');fs.writeFileSync(target,body);
  return import(pathToFileURL(target).href);
}
export function rankCorpus(root,files=420){
  fs.mkdirSync(root,{recursive:true});
  for(let i=0;i<files;i++){
    const lines=Array.from({length:720},(_,line)=>line%60===0?`export function contextHandler${i}_${line}() {}`:`// context checkpoint memory search token budget field${i%13} line${line%17}`);
    fs.writeFileSync(path.join(root,'module-'+String(i).padStart(4,'0')+'.ts'),lines.join('\n'));
  }
}
export const rankQueries=['context','checkpoint','memory','token budget','contextHandler0_0','field7','search tests','context memory checkpoint','noSuchTerm'];
export const regressionQueries=()=>['eval-self.cases','eval-natural.cases'].flatMap(file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8')).map(x=>x.query));
export const repository=fileURLToPath(new URL('../../',import.meta.url));
