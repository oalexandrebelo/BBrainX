import fs from 'node:fs';
import path from 'node:path';

export const PANEL_ENTRIES=Object.freeze(['index.html','atlas.html','observatory/index.html']);
/** Diagnóstico finito do build do host, não validação semântica de JS/CSS nem sandbox de FS. */
export function inspectPanelAssets(directory) {
  const root=path.resolve(directory),missing=new Set();let checked=0;
  const regular=relative=>{
    const parts=relative.split('/');let current=root;
    for(const p of parts){if(!p||p==='.'||p==='..')return false;current=path.join(current,p);try{const s=fs.lstatSync(current);if(s.isSymbolicLink()||(!s.isDirectory()&&current!==path.join(root,...parts)))return false;}catch{return false;}}
    try{const s=fs.lstatSync(current);return s.isFile()&&s.size>0;}catch{return false;}
  };
  try{if(!fs.lstatSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())throw new Error();}catch{return {scope:'entrypoints-and-direct-assets',ready:false,missingCount:3,checked:0};}
  for(const entry of PANEL_ENTRIES){
    if(!regular(entry)){missing.add(entry);continue;}
    checked++;
    const file=path.join(root,entry),s=fs.statSync(file);
    if(s.size>262144){missing.add(entry);continue;}
    let html,fd;
    try{fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));const buffer=Buffer.alloc(262145);let used=0;while(used<buffer.length){const n=fs.readSync(fd,buffer,used,buffer.length-used,null);if(!n)break;used+=n;}if(used>262144)throw new Error();html=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,used));}
    catch{missing.add(entry);continue;}finally{if(fd!==undefined)fs.closeSync(fd);}
    let count=0;
    for(const m of html.matchAll(/<(script|link)\b([^>]+)>/gi)){
      if(m[1].toLowerCase()==='link'&&!/\brel\s*=\s*["'](?:stylesheet|modulepreload)["']/i.test(m[2]))continue;
      const value=/\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(m[2])?.[1];if(!value)continue;
      if(++count>64){missing.add(entry+'#limit');break;}
      let url;try{url=new URL(value,'http://build.local/'+entry);}catch{missing.add(entry+'#url');continue;}
      let relative;try{relative=decodeURIComponent(url.pathname).slice(1);}catch{missing.add(entry+'#url');continue;}
      if(url.origin!=='http://build.local'||url.search||url.hash||relative.includes('\\')||!regular(relative))missing.add(entry+'#'+count);else checked++;
    }
  }
  return {scope:'entrypoints-and-direct-assets',ready:missing.size===0,missingCount:missing.size,checked};
}
