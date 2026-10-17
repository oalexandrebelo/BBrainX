const reserved=new Set(['if','for','while','switch','catch','return','function','else','do','try','new','typeof','await','with','super','constructor','default','case','throw','delete','void','yield','in','of']);
const hashComments=new Set(['.py','.rb','.sh','.yaml','.yml','.toml']),javascript=new Set(['.js','.jsx','.ts','.tsx','.mjs','.cjs']),backticks=new Set([...javascript,'.go','.rb','.sh']);
const regexAfter=new Set(['return','throw','yield','await','case','delete','void','typeof','instanceof','in','of']);
const expressionPunctuation=/[=([{,:;!?&|+*%~^<>\/-]/;
function quoteEnd(text,start,delimiter,escape=true,doubled=false,opening=delimiter.length){
  let end=start+opening;
  while(end<text.length){
    if(escape&&text[end]==='\\'){end=Math.min(end+2,text.length);continue;}
    if(text.startsWith(delimiter,end)){end+=delimiter.length;if(doubled&&text.startsWith(delimiter,end)){end+=delimiter.length;continue;}break;}
    end++;
  }
  return end;
}
function regexEnd(text,start){
  let end=start+1,bracket=false;
  while(end<text.length&&text[end]!=='\n'&&text[end]!=='\r'){
    if(text[end]==='\\'){end=Math.min(end+2,text.length);continue;}
    if(text[end]==='[')bracket=true;else if(text[end]===']')bracket=false;
    else if(text[end]==='/'&&!bracket){end++;while(/[a-z]/i.test(text[end]??''))end++;break;}
    end++;
  }
  return end;
}
// Pilha explícita: templates aninhados não gastam a pilha de chamadas; toda a interpolação continua mascarada.
function templateEnd(text,start){
  const states=[{template:true}];let i=start+1;
  while(i<text.length&&states.length){
    const state=states.at(-1),char=text[i];
    if(state.template){
      if(char==='\\'){i=Math.min(i+2,text.length);continue;}
      if(char==='`')states.pop();else if(text.startsWith('${',i)){states.push({depth:1,regex:true});i++;}
      i++;continue;
    }
    if(text.startsWith('//',i)){const end=text.indexOf('\n',i);i=end<0?text.length:end;continue;}
    if(text.startsWith('/*',i)){const end=text.indexOf('*/',i+2);i=end<0?text.length:end+2;continue;}
    if(char==='"'||char==="'"){i=quoteEnd(text,i,char);state.regex=false;continue;}
    if(char==='`'){states.push({template:true});state.regex=false;i++;continue;}
    if(char==='/'&&state.regex){i=regexEnd(text,i);state.regex=false;continue;}
    if(char==='{')state.depth++;else if(char==='}'&&--state.depth===0){states.pop();i++;continue;}
    if(/[A-Za-z_$]/.test(char)){let next=i+1;while(/[\w$]/.test(text[next]??''))next++;state.regex=regexAfter.has(text.slice(i,next));i=next;}
    else{if(!/\s/.test(char))state.regex=expressionPunctuation.test(char);i++;}
  }
  return i;
}
/** Mascara literais e comentários antes de dividir em linhas/trechos, sem mudar offsets ou quebras de linha. */
export function maskDeclarations(text,extension='.mjs',stats){
  const hash=hashComments.has(extension),sql=extension==='.sql',js=javascript.has(extension),slash=!hash&&extension!=='.json';
  const out=[];let copied=0,i=0,canRegex=true;
  while(i<text.length){
    const start=i;let end,delimiter,escape=true,literal=false;
    if((slash&&text.startsWith('//',i))||(hash&&text[i]==='#')||(sql&&text.startsWith('--',i))){
      end=text.indexOf('\n',i);if(end<0)end=text.length;
    }else if(slash&&text.startsWith('/*',i)){
      let depth=1;end=i+2;
      while(end<text.length&&depth){
        if(text.startsWith('*/',end)){depth--;end+=2;}
        else if(['.rs','.swift','.kt'].includes(extension)&&text.startsWith('/*',end)){depth++;end+=2;}
        else end++;
      }
    }else if(extension==='.html'&&text.startsWith('<!--',i)){
      end=text.indexOf('-->',i+4);end=end<0?text.length:end+3;
    }else if(extension==='.rb'&&(i===0||text[i-1]==='\n')&&/^=begin(?:\s|$)/.test(text.slice(i,i+7))){
      const close=/^=end(?:[ \t].*)?\r?$/gm;close.lastIndex=i+6;const match=close.exec(text);end=match?match.index+match[0].length:text.length;
    }else if(js&&text[i]==='/'&&canRegex){
      end=regexEnd(text,i);literal=true;
    }else{
      if(sql&&text[i]==='$'){
        const match=/^\$(?:[A-Za-z_]\w{0,127})?\$/.exec(text.slice(i,i+130));if(match){delimiter=match[0];escape=false;}
      }
      if(extension==='.rs'&&(text[i]==='r'||text.startsWith('br',i))){
        let quote=i+(text[i]==='b'?2:1);while(quote-i<130&&text[quote]==='#')quote++;
        if(text[quote]==='"'){delimiter='"'+text.slice(i+(text[i]==='b'?2:1),quote);i=quote;escape=false;}
      }
      if(!delimiter&&(text[i]==='"'||text[i]==="'"||backticks.has(extension)&&text[i]==='`')){
        if(sql&&text[i]==='"'){i++;continue;} // aspas duplas são identificadores em SQL
        if(extension==='.rs'&&text[i]==="'"&&!/^'(?:[^'\\\r\n]|\\(?:u\{[0-9a-f]{1,6}\}|.))'/i.test(text.slice(i,i+16))){i++;continue;} // lifetime, não caractere
        delimiter=text[i];
        if(extension==='.go'&&delimiter==='`')escape=false;
        if((extension==='.py'||['.java','.kt','.swift'].includes(extension)&&delimiter==='"')&&text.startsWith(delimiter.repeat(3),i))delimiter=delimiter.repeat(3);
      }
      if(delimiter){
        literal=true;
        end=js&&delimiter==='`'?templateEnd(text,i):quoteEnd(text,i,delimiter,escape,sql&&delimiter==="'",text.startsWith(delimiter,i)?delimiter.length:1);
      }
    }
    if(end===undefined){
      if(js&&/[A-Za-z_$]/.test(text[i])){let next=i+1;while(/[\w$]/.test(text[next]??''))next++;canRegex=regexAfter.has(text.slice(i,next));i=next;}
      else{if(js&&!/\s/.test(text[i]))canRegex=expressionPunctuation.test(text[i]);i++;}
      continue;
    }
    if(stats&&literal)stats.literal+=text.slice(start,end).replace(/\s/g,'').length;
    out.push(text.slice(copied,start),text.slice(start,end).replace(/[^\r\n]/g,' '));copied=end;i=end;if(literal)canRegex=false;
  }
  return out.join('')+text.slice(copied);
}
// Heurística por linha, sem AST: cobre as formas comuns de declarar um nome. Falso negativo só deixa de dar o reforço.
// Todo quantificador é limitado e nenhuma classe atravessa linha: o custo é linear mesmo em arquivo hostil.
const declarations=[
  /\b(?:async[ \t]{1,8})?function[ \t]{0,8}\*?[ \t]{0,8}([A-Za-z_$][\w$]{0,127})/g,
  /\b(?:class|interface|enum|struct|trait|protocol|module|namespace)[ \t]{1,8}([A-Za-z_]\w{0,127})/g,
  /^(?:export[ \t]{1,8})?(?:declare[ \t]{1,8})?(?:const|let|var|type)[ \t]{1,8}([A-Za-z_$][\w$]{0,127})/gm,
  /^[ \t]{0,32}(?:async[ \t]{1,8})?def[ \t]{1,8}(?:self\.)?([A-Za-z_]\w{0,127})/gm,
  /^[ \t]{0,32}(?:pub(?:\([^)\n]{0,40}\))?[ \t]{1,8})?(?:async[ \t]{1,8})?fn[ \t]{1,8}([A-Za-z_]\w{0,127})/gm,
  /^func[ \t]{1,8}(?:\([^)\n]{0,200}\)[ \t]{0,8})?([A-Za-z_]\w{0,127})/gm,
  /^[ \t]{0,32}(?:(?:public|private|internal|open|override|suspend|static|final)[ \t]{1,8}){0,6}(?:fun|func)[ \t]{1,8}([A-Za-z_]\w{0,127})/gm,
  /\bCREATE[ \t]{1,8}(?:OR[ \t]{1,8}REPLACE[ \t]{1,8})?(?:UNIQUE[ \t]{1,8})?(?:TABLE|FUNCTION|VIEW|MATERIALIZED[ \t]{1,8}VIEW|INDEX|TRIGGER|TYPE|POLICY)[ \t]{1,8}(?:IF[ \t]{1,8}NOT[ \t]{1,8}EXISTS[ \t]{1,8})?"?([\w.]{1,200})"?/gi,
  /^([A-Za-z_]\w{0,127})[ \t]{0,8}\(\)[ \t]{0,8}\{/gm,
  /^[ \t]{1,4}(?:(?:public|private|protected|static|async|readonly|override|get|set)[ \t]{1,8}){0,6}([A-Za-z_$][\w$]{0,127})[ \t]{0,8}\([^()\n]{0,400}\)[ \t]{0,8}(?::[ \t]{0,8}[^={\n]{1,200})?\{/gm
];

/** Mesmas heurísticas do índice; não é AST nem resolução semântica. */
export function* declarationsIn(text,extension='.mjs',masked=false){
  if(!masked)text=maskDeclarations(text,extension);
  for(const [i,pattern] of declarations.entries())for(const match of text.matchAll(pattern)){
    const name=match[1].split('.').at(-1);
    if(reserved.has(name))continue;
    const kind=i===1?match[0].match(/\b(class|interface|enum|struct|trait|protocol|module|namespace)\b/)[1]
      :i===2?match[0].match(/\b(const|let|var|type)\b/)[1]
      :i===7?match[0].match(/\b(TABLE|FUNCTION|VIEW|INDEX|TRIGGER|TYPE|POLICY)\b/i)[1].toLowerCase()
      :i===9?'method':'function';
    yield {name,kind};
  }
}

/** Fração dos caracteres visíveis dentro de literais de string (comentários não contam: descrevem a implementação). */
export function literalShare(text,extension){
  const visible=text.replace(/\s/g,'').length;if(!visible)return 0;
  const stats={literal:0};maskDeclarations(text,extension,stats);return stats.literal/visible;
}
