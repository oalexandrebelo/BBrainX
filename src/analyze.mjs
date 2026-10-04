import path from 'node:path';

const testPath=/(?:^|\/)(?:__tests__|__mocks__|tests?|specs?|e2e|fixtures?)(?:\/|$)|[._-](?:test|spec|stories)\.[a-z0-9]+$|_test\.(?:go|py|rb)$|(?:^|\/)test_[^/]+\.py$/i;
const generatedPath=/\.generated\.|\.min\.|\.d\.ts$|(?:^|\/)(?:generated|__generated__|__snapshots__)(?:\/|$)/i;
const docExtension=new Set(['.md','.txt']), configExtension=new Set(['.json','.yaml','.yml','.toml']);

/** Classe do arquivo pelo caminho. Decide peso de ordenação; nunca decide permissão. */
export function classify(relative){
  const file=relative.replaceAll('\\','/'), extension=path.extname(file).toLowerCase();
  if(generatedPath.test(file))return 'generated';
  if(testPath.test(file))return 'test';
  if(docExtension.has(extension))return 'doc';
  if(configExtension.has(extension))return 'config';
  return 'source';
}

const MAX_NAME=128, MAX_LINE=2000;
/** eraseUserData, erase_user_data, HTTPServer → partes em minúsculas. Devolve [] quando a palavra não é composta. */
export function splitIdentifier(word){
  if(word.length>MAX_NAME)return [];
  const parts=word.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu,'$1 $2').replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu,'$1 $2').split(/[\s_$.-]+/).filter(Boolean).map(x=>x.toLowerCase());
  return parts.length>1?parts:[];
}

const reserved=new Set(['if','for','while','switch','catch','return','function','else','do','try','new','typeof','await','with','super','constructor','default','case','throw','delete','void','yield','in','of']);
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
const heading=/^#{1,6}[ \t]{1,8}(.{1,300})$/gm;

/** Nomes declarados no trecho, com as partes dos compostos. Em Markdown, as palavras dos títulos. */
export function definitions(body,extension){
  const names=new Set(), text=body.split('\n').filter(line=>line.length<=MAX_LINE).join('\n');
  if(extension==='.md')for(const match of text.matchAll(heading))for(const word of match[1].match(/[\p{L}\p{N}_]{1,128}/gu)||[])names.add(word);
  else for(const pattern of declarations)for(const match of text.matchAll(pattern)){
    const name=match[1].split('.').at(-1);
    if(name.length>1&&!reserved.has(name))names.add(name);
  }
  const out=[];
  for(const name of names){out.push(name,...splitIdentifier(name));if(out.length>=120)break;}
  return out.join(' ');
}

/** Partes dos identificadores compostos do trecho, uma vez cada: deixa «erase user data» achar eraseUserData. */
export function symbolTerms(body){
  const seen=new Set(), out=[];
  for(const word of body.match(/[A-Za-z_$][\w$]{2,63}/g)||[]){
    if(seen.has(word))continue;seen.add(word);
    const parts=splitIdentifier(word);
    if(parts.length){out.push(parts.join(' '));if(out.length>=400)break;}
  }
  return out.join(' · ');
}

const stopwords=new Set('a o e de da do das dos em no na nos nas um uma para por com sem que se ao aos como onde quando qual quais the of and to in on for with is are be by as at it this that from or an not how where what which'.split(' '));
/** Termos de consulta que discriminam: sem palavras vazias, com as partes dos compostos. */
export function queryTerms(query){
  const terms=new Set();
  for(const word of query.match(/[\p{L}\p{N}_$]+/gu)||[]){
    const lower=word.toLowerCase();
    if(lower.length>1&&!stopwords.has(lower))terms.add(lower);
    for(const part of splitIdentifier(word))if(part.length>1&&!stopwords.has(part))terms.add(part);
  }
  return terms;
}
