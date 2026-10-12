# AB-BBX — execução própria e continuidade operacional

Revisão de produto: 12/10/2026. Base: BBrainX `e3977cc`, versão 1.5.0 Developer Preview. Este documento descreve código entregue nesta branch; instalação em estação de trabalho e aceite do produto consumidor são provas separadas.

## Identidade e limite do produto

BBrainX nasceu para acelerar e otimizar trabalho em projetos reais. Sua utilidade motivou o compartilhamento. AB-BBX é o núcleo próprio de capacidades, preparado para evoluir com consumidores distintos sem transformar um aplicativo consumidor em dependência do motor. Não é um proxy de modelos, serviço de autenticação, nova API pública remota ou mecanismo de bypass de harness.

O entrypoint `src/ab-bbx.mjs` contém a implementação efetivamente usada por `src/engine.mjs`. `src/capability.mjs` reexporta as mesmas funções e a mesma classe de erro: preservar identidade de `instanceof` evita falhas silenciosas em adaptadores antigos. A mudança consolida código próprio já existente; não representa a remoção de uma dependência de runtime que ainda estivesse instalada. A atribuição histórica permanece em THIRD_PARTY_NOTICES.md, assim como as evidências arquivadas.

Fluxo de uma chamada: resolução de capacidade → captura defensiva de argumentos/principal → validação → autorização → execução → validação de saída → resultado/evento. O prazo abrange todas as etapas. O domínio continua responsável por transação, CAS, fingerprint e efeitos. Um prazo expirado não desfaz efeitos já confirmados e não interrompe JavaScript síncrono; operações externas futuras precisam de idempotência e reconciliação próprias.

## Reindexação operacional

A busca lexical exige índice existente. Ela não deve ser descrita como leitura atômica da worktree. O comando abaixo mantém o índice reconciliado enquanto seu processo estiver ativo:

```sh
node bin/bbrainx.mjs watch --project meu-projeto --interval 30000
```

Para uma lane **já registrada**, a mesma operação atende sua raiz e seu banco derivados, preservando a autoridade compartilhada de memória:

```sh
node bin/bbrainx.mjs index --project meu-projeto --lane candidata
node bin/bbrainx.mjs watch --project meu-projeto --lane candidata --interval 30000
node bin/bbrainx.mjs search --project meu-projeto --lane candidata --query 'verifySession'
node bin/bbrainx.mjs context --project meu-projeto --lane candidata --query 'verifySession' --strict
```

`--lane` é resolvido pelo registro local existente. Não cria nem escolhe uma worktree pelo texto recuperado. Um processo serve um projeto/lane. Não use `--root` em search/index para tentar mudar uma associação: a raiz vem do registro. A memória aprovada continua na autoridade do projeto, não em uma cópia independente por branch.

O primeiro ciclo é imediato. Ciclos seguintes começam após a conclusão do anterior mais o intervalo configurado, entre 1.000 e 3.600.000 ms. O padrão de 30.000 ms é uma escolha de custo, não um SLO. O recibo contém projeto, raiz, lane, horário, duração, snapshot, contagens e motivos de exclusão, sem corpos de arquivos. SIGINT/SIGTERM encerram a espera e permitem fechar o banco. Durante trabalho síncrono, o sinal será tratado quando o event loop recuperar controle.

O processo separado evita colocar a varredura periódica no event loop do servidor MCP. Cada ciclo percorre o texto elegível, recalcula hashes e grava somente diferenças pelo indexador existente. Custo de leitura O(bytes elegíveis), manifesto O(arquivos) e ordenação O(arquivos log arquivos); os lotes de escrita permanecem limitados pelo indexador. Não há promessa de ganho em latência nem redução de tokens medida nesta entrega.

Polling integral foi escolhido para reconciliar também arquivos novos, remoções, checkout/merge e regras de ignore, sem depender de eventos de filesystem que podem ser perdidos ou variar por SO. O custo é ler o corpus a cada ciclo. Para corpus grande, aumente o intervalo e acompanhe durationMs; não reduza tetos defensivos nem ignore segredos para ganhar velocidade. Um watcher incremental com reconciliação periódica é oportunidade futura, não funcionalidade entregue.

Use um único watcher por banco/worktree. Não há lease global novo para deduplicar watchers. SQLite mantém suas transações e busy_timeout, mas dois indexadores podem produzir trabalho redundante e observar momentos distintos do filesystem. Esta entrega não adiciona um protocolo distribuído de indexação. Não instale vários serviços para o mesmo escopo.

## Falhas e recuperação

| Evento | Comportamento e ação |
|---|---|
| Processo parado | Não há atualização automática. Reiniciar produz reconciliação imediata; não inventar heartbeat saudável. |
| Merge no develop | Próxima varredura observa o checkout local atualizado; merge remoto não faz pull local. |
| Nova worktree | Registrar uma lane e executar o watcher dessa lane. A raiz canônica não acompanha automaticamente a candidata. |
| Raiz redirecionada ou lane revogada | Validação existente recusa; erro sai visível e o processo termina. |
| Banco ocupado, falha de leitura ou limite excedido | Não emitir sucesso para o ciclo falho. Corrigir causa e reiniciar; o processo não faz retry infinito silencioso. |
| Queda no meio de indexação | Lotes já confirmados ficam coerentes com o manifesto publicado. Reiniciar reconcilia; não declarar snapshot global atômico. |
| Arquivo editado durante consulta | Contexto estrito verifica arquivos selecionados. Isso não prova ausência de mudanças em arquivos não selecionados. |
| Arquivo novo antes do próximo ciclo | Pode não aparecer na busca. Indexação explícita antes de uma decisão crítica continua necessária. |
| Segredo fora dos padrões conhecidos | Filtros não certificam ausência de segredo arbitrário. Índices, logs e recibos locais são privados. |

Não há instalação automática de LaunchAgent, serviço de sistema, hook Git ou alteração de gateway. O comando é executável e testado; ativação persistente na estação real deve produzir seu próprio recibo. Não foi acessada a estação do mantenedor nesta revisão.

## Checkpoints úteis sem expansão de escopo

`done`, `decisions` e `blockers` aceitam até 2.000 caracteres por item, com o mesmo limite de itens e teto transacional total de 16 KiB. `objective` e `nextAction` mantêm 4.000; `evidence.command/result` mantêm 600. Não há truncamento silencioso. Payload total excessivo continua recusado. Não houve migração de banco.

`filesTouched` continua relativo à raiz: permitir `../` ou caminhos absolutos misturaria autoridade de workspaces. Registre a candidata na lane correta. Uma referência externa pode ser descrita concisamente em evidência; não a apresente como arquivo pertencente à raiz canônica. CAS, idempotencyKey, replay e versão permanecem intactos.

## Aplicação ao DoneFitt e medição

A nota do mantenedor relata 146 agentes, 110 acessos ao BBrainX, 1 uso de busca e 3.182 grep. Esses números são relato operacional recebido, não telemetria reproduzida nesta rodada. Eles indicam baixa adoção de retrieval; não demonstram, isoladamente, pior ranking nem economia financeira.

O protocolo de validação deve fixar fonte, árvore, worktree, versão do BBrainX e conjunto de tarefas. Compare tarefas equivalentes com índice reconciliado e baseline; registre retomadas corretas, taxa de busca útil, consultas sem resultado, leituras redundantes, duração até teste causal e qualidade aceita. Tokens reportados pelo provedor, tokens estimados de payload e tempo humano são métricas distintas. Não transforme quantidade menor de grep em meta absoluta: fallback é legítimo quando retrieval não responde.

Aceite operacional: novo símbolo pesquisável depois do ciclo; exclusão removida; lane A nunca retorna marcador exclusivo de B; checkpoint >600 e <=2.000 caracteres aceito dentro de 16 KiB; erro de indexação observável; reinício converge. Aceite do aplicativo consumidor continua em seu repositório privado, com binários, banco, worker, consentimentos e jornadas reais.

## REA e revisão do upstream

Fonte Invokta consultada: `f1e2f04f98c967ab4bb73bd02c3fa581f04ce0e5`, commit de 03/10/2026; mesma revisão já registrada em docs/core-contracts/SOURCES.md. Não há delta novo de main nessa comparação. A inspeção direta de packages/core/src/engine.ts e packages/mcp confirma os contratos de execução/adaptação usados como referência histórica.

REA 6.4.0 foi executado com análise estática do checkout:

```sh
npx --yes --ignore-scripts rea-agents@6.4.0 analyze-javascript-application /caminho/invokta --json
```

Retorno: exit 1, `capability_unavailable`, categoria `unsupported_provider`, operação `prepare_owned_process`. O `ps` deste ambiente respondeu `fatal library error, lookup self`; REA interrompeu a análise. Inventário parcial indicou 825 fontes, mas sua própria saída declara cobertura incompleta e relações conservadoras. Não usamos esse resultado como prova de equivalência, ausência de chamadas ou engenharia reversa concluída. Não desabilitamos sua verificação de propriedade de processos. Reexecução em host compatível permanece necessária para uma análise REA completa.

A reconstrução escolhida preserva o motor local já validado e estabelece a identidade AB-BBX. Reescrever validação, cancelamento e permissões apenas para trocar nomes introduziria risco sem benefício demonstrado. O futuro pivot deve manter o núcleo independente de domínio, expor adaptadores por contrato e acrescentar testes de conformidade antes de mudar interfaces.

## Oportunidades priorizadas

As fontes abaixo foram lidas em 12/10/2026; recursos e números anunciados pelos autores não foram reproduzidos neste projeto.

| Fonte | Valor para AB-BBX | Decisão e critério de adoção |
|---|---|---|
| [mattpocock/skills](https://github.com/mattpocock/skills) | Módulos pequenos, glossário, ADR, tarefas verticais e feedback causal | Incorporar a disciplina no fluxo existente; não instalar biblioteca inteira. Medir retrabalho e entendimento por tarefa aceita. |
| [vinilana/dotcontext](https://github.com/vinilana/dotcontext) | Contexto durável, contratos de tarefa, traces e lifecycle hooks | Mapear importação/exportação por versão, origem e permissões. Não criar segunda memória aprovada nem substituir políticas do host. |
| [vinilana/jev-gateway](https://github.com/vinilana/jev-gateway) | Decisão de ferramenta com abstenção; comparação routing on/off | Pesquisa isolada. Não alterar gateways, credenciais ou modelos. Exigir benchmark pareado, custo total, timeout e ausência de ampliação de autoridade. |
| [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) | Papéis e checklists de domínio | Adaptar rubricas sob demanda; quantidade de personas não justifica quantidade de agentes. Aceite exige evidência, não autodeclaração do papel. |
| [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) | AST, grafo de chamadas/rotas, impacto e indexação coordenada | Maior oportunidade para retrieval estrutural. Avaliar sidecar opt-in com corpus fixado e testes de isolamento. Não importar claims de velocidade/tokens para BBrainX. |
| [morluto/rea](https://github.com/morluto/rea) | Investigação com evidências e limitações explícitas | Ferramenta de auditoria, não dependência de execução. Concluir a análise em ambiente compatível antes de alegar equivalência. |

Ordem: operar índice na raiz correta → medir tarefas reais → avaliar AST/impacto contra o mesmo corpus → interoperabilidade documental → roteamento experimental. Não inserir LLM no caminho crítico de permissões. Não substituir FTS por embeddings antes de provar recall útil e custo de invalidação. Não tratar pesquisa como feature instalada.

## Evidência e retomada

Linux, Node 24.19.0: 740/740 testes, sem falhas/skips, e build Vite concluído. O build emitiu avisos de diretivas de módulos de dependências; não foram silenciados. Cinco testes novos cobrem identidade do motor, descoberta/remoção, lane, falhas e limites de checkpoint. Os testes existentes exercitam contratos MCP, autorização, cancelamento, replay e teto total.

Não executados nesta rodada: macOS, Windows, Node mínimo, aparelhos DoneFitt, instalação do watcher no host real e nova medição dos agentes. UI não foi alterada. A CI da branch deve ser consultada para validações remotas. Rollback é revert do commit: bancos e checkpoints existentes continuam no mesmo schema; consumidores que passarem a importar ab-bbx.mjs devem voltar junto. Checkpoints longos já gravados não são truncados no rollback; writers antigos mantêm seus limites de entrada.

Próxima ação concreta: instalar esta revisão no host do consumidor, iniciar um watcher para a raiz/lane correta, registrar dois ciclos e uma mudança pesquisável, então repetir um conjunto fixado de tarefas. A prévia não vira produto comercial homologado pela contagem de testes.
