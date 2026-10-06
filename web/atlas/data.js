/** Atlas documental. Status nunca é inferido a partir de uma animação ou de um clique. */
export const revision = 'a9636e9402e3fa673ae05b3489202da1048aef5e';
export const inspectedAt = '2026-10-05';
export const repo = 'https://github.com/oalexandrebelo/BBrainX';
export const stages = {
  shipped: {label:'Na base 0.4', color:'#83e4bd', description:'Código presente na revisão auditada; não certifica todos os clientes.'},
  optional: {label:'Opt-in', color:'#69c9ee', description:'Perfil existente, ativado explicitamente. Não pertence ao caminho padrão.'},
  candidate: {label:'Patch candidato', color:'#f2c37c', description:'Código da revisão X99 entregue à parte, ainda não incorporado à base.'},
  lab: {label:'Laboratório', color:'#d7a7f4', description:'Mecanismo exercitado isoladamente; não integrado ao runtime.'},
  planned: {label:'Proposto', color:'#acaeff', description:'Contrato ou direção de arquitetura. Implementação de produto pendente.'},
  reference: {label:'Referência', color:'#a6b9c7', description:'Fonte de técnica; a plataforma não é instalada pelo BBrainX.'},
  excluded: {label:'Não incorporar', color:'#f59a9a', description:'Desenho recusado na forma fornecida, por falhas documentadas.'}
};
const base = path => repo+'/blob/'+revision+'/'+path;
const sources = {
  base:{label:'Código auditado · 0.4.0',url:base('README.md')},
  ci:{label:'CI da base · 96 testes por plataforma',url:base('docs/validation/ci-report.json')},
  study:{label:'Mapa do estudo existente',url:base('docs/STUDY_MAP.md')},
  laya:{label:'Laya · upstream',url:'https://github.com/NandhaKishorM/laya'},
  onnx:{label:'Laya ONNX · adapter alternativo',url:'https://github.com/receptron/laya'},
  supertokens:{label:'SuperTokens · verificação de sessão',url:'https://supertokens.com/docs/post-authentication/session-management/advanced-workflows/access-token-blacklisting'},
  infisical:{label:'Infisical · Agent',url:'https://infisical.com/docs/integrations/platforms/infisical-agent'},
  medusa:{label:'Medusa · compensação de workflows',url:'https://docs.medusajs.com/learn/fundamentals/workflows/compensation-function'},
  signoz:{label:'SigNoz · observabilidade',url:'https://github.com/SigNoz/signoz'},
  unkey:{label:'Unkey · rate limiter auditado',url:'https://github.com/unkeyed/unkey/blob/f6180ba4e045839872d72d6765b74032f3601ee4/internal/services/ratelimit/ratelimit.go'},
  lightrag:{label:'LightRAG · recuperação documental',url:'https://github.com/HKUDS/LightRAG'},
  serena:{label:'Serena · ferramentas semânticas',url:'https://github.com/oraios/serena'},
  mem0:{label:'Mem0 · memória e avaliação',url:'https://github.com/mem0ai/mem0'},
  letta:{label:'Letta · agentes stateful',url:'https://github.com/letta-ai/letta'},
  graphiti:{label:'Graphiti · grafo temporal',url:'https://github.com/getzep/graphiti'},
  gcra:{label:'GCRA · redis-cell',url:'https://github.com/brandur/redis-cell'},
  fencing:{label:'Fencing · Martin Kleppmann',url:'https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html'},
  sqlite:{label:'SQLite · WAL',url:'https://sqlite.org/wal.html'},
  flow:{label:'React Flow · custom nodes',url:'https://reactflow.dev/learn/customization/custom-nodes'}
};
export {sources};
// id, título, status, camada, propósito, limite, próximo gate, fonte, código na base
const rows = [
 ['harness','Harnesses / MCP','shipped','ENTRADA','Codex, Claude Code e outros clientes consultam o mesmo projeto por capacidades delimitadas.','Protocolo testado não é homologação de toda versão de toda IDE.','Publicar matriz de handoff por cliente e versão.','base','src/clients.mjs'],
 ['mcp','Fronteira MCP','shipped','CONTRATOS','Servidor stdio próprio com seis ferramentas e escopo de projeto.','Não executa shell nem aprova memórias pelo agente.','Manter testes externos de protocolo e de cancelamento.','base','src/mcp.mjs'],
 ['engine','Motor de capacidades','shipped','CONTRATOS','Validação e autorização de capacidades no motor próprio, inspirado no Invokta.','Invokta não é dependência de runtime da versão 0.4.','Saídas específicas por capability e deadlines completos.','study','src/capability.mjs'],
 ['index','Índice incremental','shipped','RECUPERAÇÃO','Reutiliza chunks de conteúdo inalterado; reconcilia o índice textual.','Indexação síncrona pode bloquear o processo; não há watcher contínuo.','Worker de indexação com publicação atômica da geração.','base','src/retrieval.mjs'],
 ['search','Busca lexical · FTS5','shipped','RECUPERAÇÃO','Termos exatos, radicais e glossário pt → en selecionam candidatos.','Não equivale a análise semântica completa por LSP.','Avaliar chunking por declaração e novas perguntas cegas.','study','src/retrieval.mjs'],
 ['context','Compilador de contexto','shipped','CONTEXTO','Combina trechos, memórias aprovadas e checkpoint sob orçamento com proveniência.','o200k_base mede o payload, não a cobrança de todos os provedores.','Integrar e testar o patch de consistência antes de promovê-lo.','base','src/context.mjs'],
 ['memory','Memória governada','shipped','AUTORIDADE','Propor, aprovar e revogar conhecimento; distinguir hipótese de decisão.','Revogar impede recuperação futura; não apaga cópias já entregues.','Revisões explícitas e reconciliação das projeções.','base','src/store.mjs'],
 ['checkpoint','Checkpoint portátil','shipped','AUTORIDADE','Objetivo, próxima ação e evidências sobrevivem à troca de processo/harness.','Mesmo commit não significa mesma worktree ou mesmo conteúdo local.','Formalizar projeto, workspace, tarefa e snapshot separadamente.','base','src/session.mjs'],
 ['sqlite','SQLite / estado local','shipped','AUTORIDADE','Transações preservam estado e eventos no host autorizado.','Não compartilhar o banco vivo por iCloud, NFS ou pasta sincronizada.','Autoridade de serviço explícita para múltiplas máquinas.','sqlite','src/store.mjs'],
 ['laya','Laya · decisões locais','optional','DECISÃO','Perfil Python isolado com pesos verificados e execução local sob comando explícito.','Não altera o contexto padrão: os testes registrados de relevância pioraram o lexical.','Calibração e avaliação por tarefa antes da promoção.','laya','src/laya.mjs'],
 ['doctor','Doctor / setup','shipped','OPERAÇÃO','Identifica requisitos e orienta instalação sem alterar as credenciais dos harnesses.','Recomendar um backend não é medir sua inferência.','Homologação de instalação, suspensão e retomada no host real.','base','src/host.mjs'],
 ['ui','Atlas / laboratório UI','shipped','VISIBILIDADE','O painel atual explica arquitetura e oferece operações reais em um laboratório separado.','Este atlas novo é documental: navegar nele não executa agentes.','Validar interface, exportação e rotas sem modificar o núcleo.','flow','web/main.jsx'],
 ['worker','Worker por geração','candidate','CONTENÇÃO','O patch X99 delimita frames, valida respostas e aposenta workers após timeout.','Testes controlados de processos não são inferência neural nem release homologada.','Suíte completa, MCP e inferência real no Mac.','base',null],
 ['cache','Cache exato de decisões','candidate','REUSO','LRU/TTL limitado por bytes, com projeto, snapshot, memória, política e modelo na identidade.','Desligado por padrão e por processo; não é KV compartilhado entre modelos.','Medir reuso e invalidadores com Laya real antes de habilitar.','laya',null],
 ['read','Snapshot de leitura','candidate','CONSISTÊNCIA','Monta o contexto sob leitura coerente e revalida o estado antes da publicação.','Seis testes de integração do compilador ficaram sem execução no patch anterior.','Executar esses testes com as dependências fixadas.','sqlite',null],
 ['daemon','Autoridade por usuário','planned','COORDENAÇÃO','Um coordenador e um worker residente compartilhados pelos harnesses do mesmo usuário.','Ainda não existe daemon global entre os processos de harness.','IPC autenticado, lifecycle e isolamento por projeto.','base',null],
 ['identity','Projeto / workspace / tarefa','planned','IDENTIDADE','Separa conhecimento do projeto das evidências de cada checkout, tarefa e revisão.','URL do Git não concede identidade nem autorização.','Migração de dados, vínculos explícitos e teste entre worktrees.','base',null],
 ['authz','Autorização versionada','planned','SEGURANÇA','Revogações e políticas participam do selo de validade; revalidar antes de liberar conteúdo.','JWT válido não prova sessão vigente; não promete recolher bytes já enviados.','Definir ponto de linearização e testar partições/revogações.','supertokens',null],
 ['admission','Admissão ponderada','lab','CONTROLE','Combina GCRA, bytes de fila e vagas efetivas; o laboratório verifica a aritmética.','5.670 sequências verificadas não são um rate limiter distribuído implantado.','Integrar controle atômico por cliente/projeto e medir fila.','gcra',null],
 ['budget','Reserva de orçamento','lab','CONTROLE','Reservar antes da execução; manter OUTCOME_UNKNOWN até reconciliar.','Laboratório SQLite não inclui cobrança de provedores reais.','Adapters de custos e reconciliação idempotente no runtime.','medusa',null],
 ['release','Publicação com fencing','lab','CONSISTÊNCIA','Escrita condicionada à geração; estado e evento crítico no mesmo commit.','Fencing só protege quando o destino rejeita gerações antigas.','Integrar destino, revisão de acesso e falhas após commit.','fencing',null],
 ['secrets','Secrets / egress broker','planned','SEGURANÇA','Referências opacas; credenciais inseridas apenas no destino autorizado.','Não instala proxy MITM, não lê Keychain e não muda autenticação.','Escopo, rotação, políticas de egress e revisão de ameaça.','infisical',null],
 ['otel','OTel / auditoria separada','planned','OBSERVABILIDADE','Diagnóstico em fila limitada; eventos críticos permanecem transacionais.','SigNoz não é requisito do Mac; sampling não mede todo o tráfego.','Instrumentar sem prompts, segredos ou labels ilimitados.','signoz',null],
 ['symbols','Mapa de símbolos / LSP','planned','RECUPERAÇÃO','Declarações e referências reduzem leitura redundante de código.','Tree-sitter não é prova semântica de toda relação dinâmica.','Benchmark por linguagem e dependências, antes de adoção.','serena',null],
 ['lightrag','LightRAG / documentos','planned','RECUPERAÇÃO','Recuperar dados de documentos conectados sem uma resposta generativa intermediária.','Não instalado; não substitui código e memórias aprovadas como autoridade.','Demonstrar ganho em tarefas documentais incluindo ingestão.','lightrag',null],
 ['onnx','Laya ONNX alternativo','planned','DECISÃO','Avaliar receptron/laya atrás do mesmo contrato de decisão.','Paridade de tokenizer, opções e truncamento não foi homologada.','Fixar pesos e medir CPU versus Python/MPS no mesmo trabalho.','onnx',null],
 ['supertokens','SuperTokens','reference','TÉCNICA','Separar verificação de token de autorização vigente e revogação.','A plataforma não é uma dependência instalada do BBrainX.','Adapter somente no perfil de equipe que precisar de identidade remota.','supertokens',null],
 ['infisical','Infisical','reference','TÉCNICA','Identidades de máquina, referências a segredos, rotação e entrega controlada.','Não confundir cache de segredo com memória de contexto.','Broker isolado e política explícita de destino.','infisical',null],
 ['medusa','Medusa v2','reference','TÉCNICA','Reservas, idempotência e compensações inspiram o ledger de orçamento.','Compensação não é rollback universal de efeitos externos.','Provar reserva e reconciliação no executor real.','medusa',null],
 ['signoz','SigNoz / OpenTelemetry','reference','TÉCNICA','Buffers limitados, exportação e sampling com população identificada.','O dashboard não é a fonte de verdade da tarefa.','Instrumentação antes de uma plataforma analítica obrigatória.','signoz',null],
 ['unkey','Unkey','reference','TÉCNICA','Admissão, hidratação e contenção de contadores como referência.','Convergência eventual não fornece teto financeiro global estrito.','Direitos escrow apenas no perfil distribuído.','unkey',null],
 ['unsafe','Rust / ring do anexo','excluded','CONTRAPROVA','O laboratório encontrou perda de escritas em 18 de 20 interleavings do modelo finito.','Não é taxa de falha em produção. Não incorporar a implementação fornecida.','Escolher algoritmo correto, com contrato e testes de memória.','base',null]
];
export const components = rows.map(([id,title,status,layer,why,limit,gate,source,code])=>({id,title,status,layer,why,limit,gate,source,code:code?base(code):null}));
const E=(a,b,kind='flow')=>({id:a+'--'+b,source:a,target:b,kind});
export const views = [
 {id:'target',label:'Arquitetura alvo',title:'Uma autoridade. Contexto verificável.',note:'Mistura declarada de base, candidato, laboratório e proposta. Não representa tudo instalado.',ids:['harness','mcp','authz','admission','daemon','index','search','context','sqlite','release','laya','cache','read','budget','secrets','otel'],columns:4,links:[E('harness','mcp'),E('mcp','daemon'),E('daemon','authz'),E('authz','admission'),E('admission','context'),E('index','search'),E('search','context'),E('sqlite','context'),E('laya','cache'),E('cache','context'),E('context','read'),E('read','release'),E('budget','release'),E('secrets','release'),E('release','otel')]},
 {id:'runtime',label:'Runtime atual',title:'O que está na base 0.4.0.',note:'Laya é opt-in e não interfere no ranking do contexto. Escopo: revisão auditada.',ids:['harness','mcp','engine','context','index','search','memory','checkpoint','sqlite','laya','doctor','ui'],columns:4,links:[E('harness','mcp'),E('mcp','engine'),E('engine','context'),E('index','search'),E('search','context'),E('memory','context'),E('checkpoint','context'),E('sqlite','index'),E('sqlite','memory'),E('sqlite','checkpoint'),E('doctor','laya'),E('context','ui')]},
 {id:'laya',label:'Laya + cache',title:'Decisão curta. Reuso com identidade.',note:'O cache candidato é exato, por processo e desligado por padrão. Não compartilha KV entre modelos.',ids:['daemon','identity','worker','laya','cache','read','release','onnx'],columns:4,links:[E('daemon','worker'),E('identity','cache'),E('worker','laya'),E('laya','cache'),E('cache','read'),E('read','release'),E('onnx','worker')]},
 {id:'governance',label:'Protocolo X99',title:'Permissão, capacidade e commit.',note:'Os mecanismos em roxo têm verificações de laboratório, não integração de produto.',ids:['identity','authz','admission','budget','sqlite','read','release','secrets','otel','daemon','memory','checkpoint'],columns:4,links:[E('identity','authz'),E('authz','admission'),E('admission','budget'),E('budget','release'),E('sqlite','read'),E('read','release'),E('secrets','release'),E('release','otel'),E('daemon','sqlite'),E('memory','read'),E('checkpoint','read')]},
 {id:'ecosystem',label:'Novas incorporações',title:'Extrair técnicas. Não empilhar serviços.',note:'As cinco plataformas são referências; seus mecanismos abaixo têm status próprio.',ids:['supertokens','infisical','medusa','signoz','unkey','authz','secrets','budget','otel','admission','symbols','lightrag','onnx','cache','unsafe'],columns:5,links:[E('supertokens','authz','reference'),E('infisical','secrets','reference'),E('medusa','budget','reference'),E('signoz','otel','reference'),E('unkey','admission','reference')]}
];
export function visibleComponents(viewId, status='all', query='') {
 const view=views.find(v=>v.id===viewId)||views[0];
 const normalized = value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const q=normalized(query.trim());
 return view.ids.map(id=>components.find(c=>c.id===id)).filter(c=>(status==='all'||c.status===status)&&(!q||normalized(c.title+' '+c.layer+' '+c.why).includes(q)));
}
export function graphFor(viewId,status='all',query='') {
 const view=views.find(v=>v.id===viewId)||views[0], list=visibleComponents(view.id,status,query), ids=new Set(list.map(c=>c.id));
 const nodes=list.map((c,i)=>({id:c.id,type:'atlas',position:{x:(i%view.columns)*292,y:Math.floor(i/view.columns)*200},data:c}));
 const links=view.links.filter(e=>ids.has(e.source)&&ids.has(e.target)).map(e=>({...e,documentedOnly:e.kind==='reference'||[e.source,e.target].some(id=>!['shipped','optional'].includes(components.find(c=>c.id===id).status))}));
 return {view,nodes,edges:links};
}
export const evidence = [
 {label:'Base publicada',value:'96',unit:'testes por plataforma',note:'CI da revisão 912aa253, anterior a este atlas. Não são 288 testes distintos.',url:sources.ci.url},
 {label:'Patch X99 anterior',value:'43',unit:'testes locais aprovados',note:'38 novos + 5 existentes. 6 testes de compilador não executados. Patch fora da base.',url:null},
 {label:'Protocolo isolado',value:'35',unit:'verificações de laboratório',note:'Python/SQLite/processos em Linux. Sem Laya, runtime ou validação nativa macOS.',url:null}
];
export const comparators = [
 {name:'Serena',area:'Código e símbolos',advantage:'Ferramentas semânticas e referências por LSP; integração MCP documentada.',gap:'BBrainX ainda usa busca lexical e não tem LSP no núcleo.',source:'serena'},
 {name:'Mem0',area:'Memória de agentes',advantage:'Pipeline de memória e avaliação publicada; separar plataforma gerenciada de OSS.',gap:'BBrainX precisa de avaliação externa de memória/continuidade; top-k de arquivos não é a mesma métrica.',source:'mem0'},
 {name:'Letta',area:'Agentes com estado',advantage:'Runtime stateful e memória persistente; projeto atual direciona ao Letta Code.',gap:'BBrainX é uma camada de contexto, não um substituto completo desse harness.',source:'letta'},
 {name:'Graphiti',area:'Conhecimento temporal',advantage:'Construção incremental de grafo temporal e recuperação híbrida.',gap:'BBrainX mantém memória aprovada e lexical; não implementa esse grafo.',source:'graphiti'}
];
export const gates = [
 'Suíte integral e MCP sobre o patch X99, sem somar evidências antigas.',
 'Handoff real por versão de Codex, Claude Code, Gemini CLI e demais clientes.',
 'Calibração Laya em holdout: qualidade e cobertura, não apenas latência.',
 'Daemon e cache compartilhados com revogação, limites e retomada.',
 'Benchmark pareado por tarefa aceita, incluindo releituras e custo.',
 'Revisão externa de segurança, instalação e documentação de falhas.'
];
