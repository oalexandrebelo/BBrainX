# BBrainX: posicionamento verificável, não ranking presumido

**Data-base: 5 de outubro de 2026.** Comparação documental de capacidades, não benchmark pareado, auditoria integral dos concorrentes ou certificação de mercado.

## Parecer

O BBrainX é um projeto promissor com um recorte útil: contexto local compartilhado entre harnesses, memória explicitamente aprovada, checkpoints com proveniência e Laya como perfil de decisão controlado. A base possui testes de domínio e protocolo e um caminho local sem API de IA obrigatória. Isso é evidência de trabalho de engenharia, não demonstração de que já seja um dos melhores sistemas do segmento.

Ainda não há neste conjunto de evidências: comparação independente de tarefas completas; daemon e cache Laya compartilhados entre todos os processos; recuperação semântica por LSP; sincronização entre máquinas; avaliação externa de segurança; série de versões operadas pela comunidade. Algumas dessas propriedades não são requisitos do primeiro usuário local, mas delimitam a comparação.

## Referências equivalentes por capacidade

| Referência | Capacidade documentada | Pergunta que o BBrainX precisa responder |
|---|---|---|
| Serena | Navegação e edição por símbolos/referências, com language servers e MCP. | O BBrainX encontra e entrega evidência correta em uma tarefa multiarquivo com menos trabalho repetido? |
| Mem0 | Memória persistente e suite de avaliação de memória. Resultados da plataforma não são automaticamente os do SDK OSS. | Qual é a taxa de recuperação de decisões, atualização/revogação e continuidade em holdout? |
| Letta / Letta Code | Agentes stateful, identidade e memória persistente em um harness próprio. | A portabilidade BBrainX entre harnesses externos compensa limitações e custo operacional? |
| Graphiti | Grafo temporal incremental, episódios, invalidação e recuperação híbrida. | As consultas temporais e contradições do BBrainX exigem grafo, ou seu modelo governado resolve o recorte mais barato? |

Fontes: repositórios oficiais abaixo. Descrições upstream não são prova de superioridade universal. Não comparar top-k de arquivos do BBrainX com acurácia de resposta de memória sem igualar tarefa, modelos e critérios.

## Forças atuais

**Escopo local estreito:** o fluxo determinístico não exige modelo, Python ou conta externa. **Proveniência:** pacote com caminho, revisão e hash. **Governança:** hipótese e decisão aprovada não são a mesma entidade. **Continuidade:** checkpoint recuperável por outra sessão. **Honestidade de produto:** Laya permanece fora do ranking de contexto quando o experimento registrado piora a busca lexical.

Nenhuma dessas ideias isoladamente é exclusiva. O diferencial pretendido é a composição operacional comprovada, não a descoberta de que agentes precisam de memória.

## Lacunas prioritárias

1. Concluir a validação do patch X99 anterior; o atlas não o incorpora ao runtime.
2. Registrar instalação, execução, cancelamento, checkpoint e retomada em cada harness e versão suportados.
3. Instalar uma autoridade por usuário com worker compartilhado, limites e revisão de acesso, sem um modelo duplicado por cliente.
4. Separar identidade do projeto, worktree, tarefa e snapshot para evitar evidências cruzadas.
5. Acrescentar recuperação estrutural somente com ablação que demonstre ganho.
6. Calibrar Laya por workload com holdout, abstention e custo de erro; latência curta sozinha não justifica promoção.
7. Publicar testes adversariais de revogação, timeout, fila cheia, processo morto e resultado desconhecido.
8. Medir custo e tempo por tarefa aceita, não somente tokens novos ou taxa de cache.

## Plano de comparação proposto

Congelar versões, raízes autorizadas e snapshots. Separar tarefas de localização, bug local, alteração multiarquivo, memória temporal e handoff. Definir aceitação por testes e revisão antes de executar. Não fornecer soluções do conjunto ao treinamento ou à memória dos candidatos. Randomizar ordem e separar frio/quente. Publicar scripts, falhas e intervalos, sem extrapolar um pequeno conjunto exploratório para liderança global.

O mesmo serviço pode vencer em custo local e perder em cobertura semântica. Registrar e explicar esse trade-off é mais útil à comunidade que uma nota arbitrária de 9,8/10.

## Reputação e GitHub

Estrelas medem atenção; não substituem segurança, manutenção, suporte, testes, qualidade de recuperação ou sucesso de tarefa. Não foi calculado um ranking de estrelas neste estudo. A visibilidade privada atual do repositório é preservada; publicar este diagrama não abre o código à comunidade automaticamente.

A meta recomendada para lançamento é uma demonstração reproduzível: iniciar uma tarefa em um harness, alternar para outro, recuperar decisões e evidências válidas, concluir a mudança e contabilizar o retrabalho evitado. Repetir esse resultado em contribuições externas é um marco de confiança mais forte que prometer top 1 antes do lançamento.

## Fontes primárias consultadas

- BBrainX base: https://github.com/oalexandrebelo/BBrainX/tree/a9636e9402e3fa673ae05b3489202da1048aef5e
- Serena: https://github.com/oraios/serena
- Mem0: https://github.com/mem0ai/mem0
- Mem0 Memory Benchmarks: https://github.com/mem0ai/memory-benchmarks
- Letta: https://github.com/letta-ai/letta
- Letta Code: https://github.com/letta-ai/letta-code
- Graphiti: https://github.com/getzep/graphiti

Os links de branch podem evoluir. O commit do BBrainX comparado está fixado; os concorrentes foram examinados documentalmente, não executados nesta entrega.
