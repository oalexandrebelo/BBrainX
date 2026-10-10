import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

/** Source distributions describe committed blobs, never checkout bytes or symlink targets. */
export function sourceManifest(root=process.cwd()){
  const git=(...args)=>execFileSync('git',['--no-replace-objects','-C',root,...args],{maxBuffer:64*1024*1024});
  const commit=git('rev-parse','HEAD').toString().trim(),tree=git('rev-parse',commit+'^{tree}').toString().trim();
  const entries=git('ls-tree','-r','-z',commit).toString('utf8').split('\0').filter(Boolean).map(entry=>{
    const tab=entry.indexOf('\t'),[mode,type,object]=entry.slice(0,tab).split(' '),file=entry.slice(tab+1);
    if(type!=='blob'||!['100644','100755'].includes(mode))throw new Error('Unsupported source entry: '+file);
    if(file.split('/').some(part=>['..','.','.git','node_modules','.bbrainx','vendor'].includes(part))||file.startsWith('/')||file.includes('\\'))throw new Error('Unsafe source path: '+file);
    return {file,mode,object};
  }).sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
  const files=Object.create(null),modes=Object.create(null);let version;
  for(const {file,mode,object} of entries){
    const bytes=git('cat-file','blob',object);
    files[file]=createHash('sha256').update(bytes).digest('hex');modes[file]=mode;
    if(file==='package.json')version=JSON.parse(bytes.toString('utf8')).version;
  }
  if(typeof version!=='string'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version))throw new Error('Invalid committed package version');
  const sourceTimestamp=Number(git('show','-s','--format=%ct',commit).toString().trim());
  return {schemaVersion:2,commit,tree,version,sourceTimestamp,archive:'BBrainX-v'+version+'-source.zip',
    contentSource:'git-blobs',dependencyLocks:Object.fromEntries(['package-lock.json','media/package-lock.json'].filter(file=>files[file]).map(file=>[file,files[file]])),files,modes};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const manifest=sourceManifest();fs.mkdirSync('artifacts',{recursive:true});
  const target='artifacts/source-manifest.json',temporary=target+'.'+process.pid+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(manifest,null,2)+'\n');fs.renameSync(temporary,target);
  console.log(JSON.stringify({commit:manifest.commit,trackedFiles:Object.keys(manifest.files).length,manifest:target,contentSource:manifest.contentSource}));
}
