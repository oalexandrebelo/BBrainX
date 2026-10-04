import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {chromium} from '@playwright/test';

// uso: node scripts/brand-gif.mjs [--keep]  →  public/brand/options/opcoes.gif
// Desenha cada opção de marca no Chromium do Playwright e monta o GIF com o ffmpeg do sistema. É manual: a CI não roda.
// Para trocar a marca em uso, mude IN_USE aqui e siga a lista de docs/BRAND.md.
const IN_USE='c-monograma-bx';
// [arquivo, rótulo, início e largura do desenho dentro da caixa de 64 unidades]
const options=[['a-duas-camadas','A · duas camadas',16,36],['b-facetado','B · facetada',16,32],['c-monograma-bx','C · monograma BX',4,56]];
const HOLD=1.8, FADE=.4, FPS=12, WIDTH=960, HEIGHT=320, folder='public/brand/options', output=path.join(folder,'opcoes.gif');
const ink='#0b151b', mint='#b6efb9', aqua='#63d5b9', light='#e7eeec', muted='#9bb2ba';

function frame([name,label,left,width],index){
  const paths=fs.readFileSync(path.join(folder,name+'.svg'),'utf8').match(/<g[\s\S]*<\/g>/)[0];
  const dots=options.map((_,at)=>'<i style="background:'+(at===index?mint:'#2c4648')+'"></i>').join('');
  return `<!doctype html><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}body{width:${WIDTH}px;height:${HEIGHT}px;background:${ink};font-family:Arial,Helvetica,sans-serif;position:relative;overflow:hidden}
.eyebrow{position:absolute;left:56px;top:34px;font:15px ui-monospace,Menlo,monospace;letter-spacing:3px;color:${aqua}}
.slot{position:absolute;left:56px;top:88px;width:150px;height:120px;display:flex;align-items:center;justify-content:center;color:${mint}}
.slot svg{height:120px}
.name{position:absolute;left:240px;top:92px;font-size:78px;font-weight:600;letter-spacing:-3px;line-height:1;color:${light}}.name b{font-weight:600;color:${mint}}
.sub{position:absolute;left:245px;top:182px;font:16px ui-monospace,Menlo,monospace;letter-spacing:6px;color:${muted}}
.label{position:absolute;left:56px;bottom:30px;font-size:20px;color:${light};display:flex;align-items:center;gap:14px}
.label em{font:12px ui-monospace,Menlo,monospace;font-style:normal;letter-spacing:2px;color:${mint};border:1px solid ${mint};border-radius:4px;padding:4px 8px}
.dots{position:absolute;right:56px;bottom:36px;display:flex;gap:10px}.dots i{width:10px;height:10px;border-radius:50%}
</style><div class="eyebrow">MARCA EM ESTUDO · TRÊS OPÇÕES</div>
<div class="slot"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} 0 ${width} 64">${paths}</svg></div>
<div class="name">BBrain<b>X</b></div><div class="sub">GODMODCODE</div>
<div class="label">${label}${name===IN_USE?'<em>EM USO</em>':''}</div><div class="dots">${dots}</div>`;
}

const work=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-brand-')), browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:WIDTH,height:HEIGHT},deviceScaleFactor:1});
  for(const [index,option] of options.entries()){await page.setContent(frame(option,index));await page.screenshot({path:path.join(work,index+'.png')});}
}finally{await browser.close();}

// Cada opção fica HOLD segundos; a troca é uma fusão de FADE segundos. O último quadro é igual ao primeiro: o laço não dá salto.
const still=(index,seconds)=>['-loop','1','-t',String(seconds),'-i',path.join(work,index+'.png')];
const inputs=[...still(0,HOLD+FADE),...options.slice(1).flatMap((_,at)=>still(at+1,HOLD+2*FADE)),...still(0,FADE)];
let chain='', previous='[0]';
for(let at=1;at<=options.length;at++){const offset=(at*HOLD+(at-1)*FADE).toFixed(2), out='[x'+at+']';chain+=previous+'['+at+']xfade=transition=fade:duration='+FADE+':offset='+offset+out+';';previous=out;}
chain+=previous+'fps='+FPS+',split[a][b];[a]palettegen=max_colors=96:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle';
const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...inputs,'-filter_complex',chain,'-loop','0',output],{stdio:['ignore','inherit','inherit']});
if(result.error||result.status!==0){console.error(result.error?.code==='ENOENT'?'ffmpeg não encontrado no PATH. Instale-o e repita.':'ffmpeg terminou com '+result.status+'.');process.exit(1);}
if(process.argv.includes('--keep'))console.error('quadros em '+work);else fs.rmSync(work,{recursive:true,force:true});
console.log(JSON.stringify({file:output,bytes:fs.statSync(output).size,seconds:+(options.length*(HOLD+FADE)).toFixed(1),inUse:IN_USE}));
