# Revisão independente final das decisões de arquitetura

Data: 6 de outubro de 2026. Escopo exclusivo: leitura integral de `sections/decisoes-arquitetura.md` (299 linhas na versão examinada) e dos cinco JSON indicados: `runtime-audit`, `tokenizer-audit`, `laya-real-benchmark`, `laya-resource` e `pr6-tree-verification`. Não foram relidos outros anexos, executados ensaios, chamados modelos ou modificados produto/configurações. Este parecer não autoriza publicação remota, merge ou deploy.

O texto separa adequadamente medições e contratos futuros. Não encontrei contradição nos números centrais nem propaganda que promova a Laya a autoridade de segurança. Há uma correção factual imprescindível e um ajuste importante de precisão de confiança antes da entrega documental. As referências de linha abaixo correspondem à versão lida; correções posteriores podem deslocá-las.

## Correções antes da entrega

### RF-01 — versão do pacote Laya atribuída ao Python

**Fato demonstrável, correção imprescindível.** `sections/decisoes-arquitetura.md:27` diz `Python 0.3.26`. O JSON identifica explicitamente `profile: laya 0.3.26 · multilingual` e `runtime.laya: 0.3.26`; essa versão pertence à Laya. A própria seção detalhada do documento usa corretamente `Laya 0.3.26` em `:122`. Fontes: `evidence/laya-real-benchmark.json:5` e `:70`.

Substituição suficiente: **“Laya 0.3.26, runtime Python, pesos multilingual fixados, opt-in”**. Não inventar uma versão do Python a partir desses JSON: nenhum dos cinco registra essa versão.

### RF-02 — aprovação humana apresentada como garantia técnica

**Ajuste importante de fronteira de confiança; não nova vulnerabilidade.** A consequência de `sections/decisoes-arquitetura.md:25`, **“Aprovação continua ato humano”**, é mais forte do que o mecanismo demonstrado. O fluxo operacional prevê revisão humana, mas uma aprovação explícita por principal confiado não comprova presença humana. Na auditoria de fonte já realizada, o review é acessível pelo CLI no domínio confiado do host; os cinco JSON agora revisados tampouco contêm prova de autenticação/presença humana no review.

Substituição recomendada: **“Aprovação exige review explícito no domínio confiado do host; a decisão humana é o procedimento operacional previsto, sem prova técnica de presença humana. Revogação impede novas seleções, sem recolher bytes já entregues.”**

O mesmo cuidado vale para **“autentica o principal lógico”** em `:34`: preferir **“valida o principal lógico emitido pelo host”** se não houver mecanismo adicional de autenticação. Esse ajuste não transforma processos de mesmo UID em tenants isolados nem acusa bypass remoto; apenas evita confundir principal lógico, autorização de ferramenta e identidade humana. O percurso futuro de aprovação/revogação por humano em `:253` pode permanecer como gate de homologação.

## Precisões editoriais opcionais

### RF-03 — tamanho total dos assets chamado de tamanho dos pesos

`sections/decisoes-arquitetura.md:295` usa **“pesos de 647 MiB”**. Os cinco assets de `evidence/laya-resource.json:9-39` somam 678.201.636 bytes, aproximadamente **646,78 MiB**; `model.safetensors` sozinho tem 643.835.514 bytes, aproximadamente **614,01 MiB**. A diferença corresponde sobretudo ao tokenizer. Preferir **“assets do perfil de aproximadamente 647 MiB”**. Isso não afeta os números de RSS ou a conclusão sobre residência do processo.

### RF-04 — identidade de peer no broker futuro precisa manter o limite de mesmo UID

`sections/decisoes-arquitetura.md:153` propõe verificar identidade do peer por socket Unix/named pipe. É contrato futuro, corretamente identificado. Credenciais de usuário do peer, por si sós, não provam qual IDE/harness produziu a requisição quando processos compartilham UID. Acrescentar, se desejado: **“A identidade do usuário não autentica o aplicativo; grants são fixados pelo host e a topologia não constitui sandbox contra processo malicioso de mesmo UID.”** Não há exploração remota comprovada nem obrigação de construir esse broker antes das correções locais.

## Conferências concluídas

| Afirmação examinada | Evidência e conclusão |
|---|---|
| Raiz substituída entrega contexto externo mesmo com arquivo verificado (`:46-48`) | `runtime-audit.json:117-124`: `observed: true`, raiz resolvida diferente, `selectedFilesVerified: true`, refresh de `source.js`. O documento preserva corretamente o requisito de controle do filesystem e não afirma escalada de UID ou leitura de diretório protegido. |
| Compactação omite decisão/bloqueio sem apagar checkpoint (`:56`) | `runtime-audit.json:126-131`: duas presenças falsas, 241 tokens, checkpoint ainda armazenado. A correção proposta não transforma texto de repositório em memória aprovada. |
| CAS e idempotência entre processos (`:66`) | `runtime-audit.json:133-159`: uma versão 1 e um conflito no CAS; duas respostas versão 1 com mesma chave; um evento em cada cenário. Não é apresentado como exactly-once de efeitos externos. |
| Crash por SIGKILL antes do commit (`:68`) | `runtime-audit.json:161-170`: SIGKILL, `integrity_check: ok`, zero eventos não commitados. O documento distingue corretamente processo morto de perda de energia, disco cheio, corrupção e restauração. |
| Escala de 60/1.000/5.000 arquivos (`:93-97`) | Tempos, bytes, hits, RSS e tamanhos de DB são coerentes com `runtime-audit.json:9-114`. O texto informa corpus artificial/curto, ordem aquecida e conexões acumuladas; não extrapola até 20.000 arquivos/256 MiB. |
| Contagem de tokens e pior caso (`:105-118`) | Paridade 105/105 e p50/p95 conferem com `tokenizer-audit.json:6-18`; tempos de entradas longas conferem com `:20-111`. O caso de 256 KiB foi morto por watchdog externo com `result: null`; o texto evita apresentar três segundos como duração integral do contador. |
| Laya: qualidade, carga e recursos (`:122-137`) | Matriz de confusão, métricas, limiares e carga conferem com `laya-real-benchmark.json:6-73`. Assets, RSS, intervalo e wrapper conferem com `laya-resource.json:8-54`. Amostra sintética, batch amortizado, ausência de holdout, limiares sem calibração e RSS separado da GPU estão explícitos. |
| Identidade do PR #6 (`:3`) | `pr6-tree-verification.json:2-7`: head `2c87f61c3d6355adf61e8675e2f3ee96c5cb2489`, árvore completa, 125 blobs conferidos, zero divergências, scripts não rastreados excluídos. Essa prova compara conteúdo rastreado; não certifica comportamento funcional adicional. |
| Cache, deadline, filas, memória residente e publicação (`:184-220`) | Estão classificados como contratos/metas propostos. Não aparecem como configuração implantada, SLA medido ou benefício de tarefa provado. A expressão de break-even é consistente com o custo médio escrito. |

## Gates preservados e limites deste parecer

Permanecem gates explícitos, sem promoção a capacidade entregue: Windows junction/reparse e jornadas nativas por harness; race de registro; disco cheio/I/O/perda de energia/restore; snapshots e revalidação de revogação; preempção/limites do broker; carga de corpus maior; task-level holdout; residência compartilhada e sua identidade; sincronização/autoridade distribuída. A revisão não converte o acesso de mesmo UID em incidente de exfiltração nem transforma isolamento não sandboxado em promessa de sandbox.

Os cinco JSON não contêm logs das suítes/build/browser, prova de hardware comercial, geradores de configuração ou procedência de todo o histórico Git; esses assuntos foram citados pelo documento com outras fontes e estão fora desta conferência limitada. Nenhuma dessas afirmações recebe certificação adicional deste parecer.

**Gate documental:** corrigir RF-01 e qualificar RF-02; RF-03/RF-04 são ajustes opcionais de precisão. Não há necessidade de rerodar inferência, instalar dependências ou alterar o produto para realizar essas correções de redação.
