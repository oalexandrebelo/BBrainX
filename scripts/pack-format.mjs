/**
 * Os scripts de paridade comparam o pacote atual com o do compilador original (a9636e9) com deepEqual. Mudanças de formato são
 * intencionais e documentadas em docs/RELEASE_NOTES.md: o cabeçalho de cada seção mostra 12 hex do hash do arquivo (isso também muda
 * quantas seções cabem no orçamento), o pacote ganhou sourcesOmittedByRelevance e a busca devolve um acerto por arquivo por padrão (o pacote
 * continua lendo a lista crua de trechos com byFile:false). Esta função aplica só essas mudanças ao FONTE do original,
 * de modo que a comparação continua exata em todo o resto, inclusive no preenchimento do orçamento. Se uma âncora não existir mais,
 * falha em vez de comparar com um original sem as mudanças. Quem compara também roda o compilador atual com
 * BBRAINX_PACK_MIN_RELEVANCE=0: o piso de relevância muda de propósito quais seções entram.
 */
export function withCurrentFormat(source) {
  const edits = [
    ["' [sha256:'+item.file_hash+']\\n'", "' [sha256:'+item.file_hash.slice(0,12)+']\\n'"],
    ['sourcesOmittedByBudget,memoriesOmitted,', 'sourcesOmittedByBudget,sourcesOmittedByRelevance:0,memoriesOmitted,'],
    ['search(store,project,query,30)', 'search(store,project,query,30,{byFile:false})']
  ];
  return edits.reduce((text, [from, to]) => {
    if (text.split(from).length !== 2) throw new Error('ORIGINAL_FORMAT_ANCHOR_MISSING: ' + from);
    return text.replace(from, () => to);
  }, source);
}
