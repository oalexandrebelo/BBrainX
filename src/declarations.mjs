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

/** Mesmas heurísticas do índice; não é AST nem resolução semântica. */
export function* declarationsIn(text){
  for(const [i,pattern] of declarations.entries())for(const match of text.matchAll(pattern)){
    const name=match[1].split('.').at(-1);
    if(name.length<=1||reserved.has(name))continue;
    const kind=i===1?match[0].match(/\b(class|interface|enum|struct|trait|protocol|module|namespace)\b/)[1]
      :i===2?match[0].match(/\b(const|let|var|type)\b/)[1]
      :i===7?match[0].match(/\b(TABLE|FUNCTION|VIEW|INDEX|TRIGGER|TYPE|POLICY)\b/i)[1].toLowerCase()
      :i===9?'method':'function';
    yield {name,kind};
  }
}
