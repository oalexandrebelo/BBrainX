/**
 * Ponte pt → en para consultas: o código costuma estar em inglês e a pergunta, em português.
 * Cada chave é o radical de uma palavra portuguesa (sem acento); o valor são radicais em inglês, usados como
 * prefixo na busca. É vocabulário geral de programação, não um dicionário: falta de entrada só deixa de ajudar.
 */
const entries={
  arquiv:'file',pasta:'folder director',diretori:'director folder',caminh:'path',banc:'database',tabel:'table',colun:'column',linh:'line row',registr:'record register log',
  chav:'key',senh:'password',segred:'secret',credenc:'credential',token:'token',usuari:'user',sess:'session',permiss:'permission',autoriz:'authoriz allow',autentic:'authenticat auth',acess:'access',
  requis:'request',respost:'response reply',cabecalh:'header',corp:'body',rota:'route',servidor:'server',client:'client',porta:'port',enderec:'address url',naveg:'browser',origem:'origin',site:'site origin',
  erro:'error',falh:'fail error',exce:'exception error',avis:'warn',tentativ:'retry attempt',praz:'deadline timeout',temp:'time timeout',esgot:'timeout exhaust',cancel:'cancel abort',
  busc:'search find query',consult:'query search',pesquis:'search',indic:'index',index:'index',orden:'order sort rank',classific:'classif rank',peso:'weight',pontu:'score',posic:'position rank',result:'result',
  memori:'memory',contex:'context',orcament:'budget',limit:'limit max',teto:'limit max',tamanh:'size length',contag:'count',quantid:'count amount',metad:'half',
  grav:'write save',salv:'save write',ler:'read',leitur:'read',escrit:'write',apag:'delete remove',remov:'remove delete',exclu:'delete remove exclude',cria:'create',gera:'generate create',atualiz:'update refresh',alter:'change modif',mudan:'change',
  abr:'open',fech:'close',inici:'start init launch',parar:'stop',parad:'stop',encerr:'close stop',envi:'send',receb:'receive',devolv:'return',retorn:'return',cham:'call invoke',execu:'run execute',rodar:'run',
  aprov:'approve',revog:'revoke',rejeit:'reject',recus:'reject refuse deny',negar:'deny',propost:'propose',propo:'propose',valid:'valid',verific:'verif check',confer:'check verify compare',compar:'compare equal',
  vers:'version',migr:'migrat',esquem:'schema',copia:'copy backup',seguranc:'security safe backup',protec:'protect',cifr:'encrypt cipher',criptograf:'encrypt crypto',assin:'sign',
  test:'test',avali:'evaluat eval',medi:'measure metric',caso:'case',esperad:'expect',simul:'mock fake simulat',
  configur:'config',ajust:'setting config tune',ambient:'environment env',variav:'variable env',instal:'install setup',depend:'dependenc',pacot:'package pack',modul:'module',bibliotec:'librar',
  funca:'function',metod:'method',class:'class',tipo:'type',nome:'name',declar:'declar defin',defin:'defin declar',identific:'identifier',palavr:'word term',termo:'term word',text:'text',trech:'chunk snippet excerpt',bloc:'block chunk',
  list:'list',fila:'queue',pilh:'stack',mapa:'map',conjunt:'set',vetor:'array vector',objet:'object',cadei:'string chain',numer:'number',data:'date data',hora:'time hour',
  comand:'command',ferrament:'tool',capacid:'capabilit',taref:'task job',trabalh:'job work',process:'process',fluxo:'flow stream',event:'event',estad:'state status',situac:'status state',
  repeti:'repeat duplicate retry idempot',duplic:'duplicate dedup',mesm:'same',unic:'unique single',simultan:'concurrent parallel shared',concorr:'concurren',compartilh:'share',conflit:'conflict',
  impress:'fingerprint hash print',digital:'fingerprint hash',resum:'hash digest summary',codific:'encod utf',invalid:'invalid',vazi:'empty stop',ignor:'ignore skip',pular:'skip',
  painel:'dashboard panel server',tela:'screen page view',botao:'button',formul:'form',interfac:'interface',estil:'style css',
  compact:'archive zip compress compact',distribu:'distribut package release',public:'publish release public',lanc:'release launch',implant:'deploy',
  sistem:'system platform',plataform:'platform',maquin:'machine host',diagnost:'doctor diagnos',suport:'support',projet:'project',repositor:'repositor repo',ramo:'branch',
  negoci:'negotiat',protocol:'protocol',abert:'open init',polit:'policy',regra:'rule policy',fals:'forg csrf fake false'
};
const table=Object.entries(entries).map(([stem,terms])=>[stem,terms.split(' ')]);

/** Radicais em inglês para uma palavra já sem acento e em minúsculas. Chave curta só aceita sufixo curto. */
export function translate(plain){
  const terms=[];
  for(const [stem,english] of table)if(plain.startsWith(stem)&&plain.length-stem.length<=(stem.length<=4?3:6))terms.push(...english);
  return terms;
}
