# Backlog proposto — BBrainX, 06/10/2026

Revisão a9636e9; plano documental, sem issues publicadas ou correções aplicadas.


O backlog abaixo é proposto e não foi publicado como issue. Cada unidade deve nascer como issue/branch/PR focada no repositório BBrainX, com teste que reproduz o defeito, critério de pronto e rollback. Não reutilizar automaticamente regras de deploy/infra do DoneFitt para outro produto. Os contratos locais do BBrainX prevalecem no seu código.

| Ordem / ID | Trabalho e escopo | Dependências | Aceite mínimo e medição |
|---|---|---|---|
| 1 / BX-01 | Revalidar raiz registrada em leitura/index/refresh | Nenhuma | Reprodução de symlink deixa de entregar B; Windows junction/reparse testado; limitações TOCTOU explícitas. |
| 2 / BX-02 | Preservar decisões/bloqueios no handoff e budget fail-closed | Nenhuma | Teste de compactação vermelho antes; obrigação preservada ou erro explícito em todos os budgets suportados. |
| 3 / BX-03 | Corrigir pipeline de Atlas e keyboard selection | PR #6 | `shell: bash`/pipefail; failure real não gera success; Enter/Space/roving tabs comprovados; testes estáticos e MPA preservados. |
| 4 / BX-04 | Qualificar Node 22 suportado sem esconder warnings | Nenhuma | 96/96 nas versões declaradas; trace parse separa warnings esperados de eventos; stdout continua MCP puro. |
| 5 / BX-05 | Byte-bound chunking e tokenização com cancelamento real | BX-01/02 | Long pretoken não monopoliza controle; orçamento exato e hashes preservados; Unicode, linha gigante e arquivo limítrofe. |
| 6 / BX-06 | Harden broker Laya: frames, queue, deadline total e geração | Nenhuma para perfil opt-in | Bounds antes de parsing/alocação; respostas tipadas/finita; kill/timeout rejeitam respostas velhas; inferência real além de teste de processo. |
| 7 / BX-07 | Micro-otimizações do núcleo sem dependência nova | BX-01/02/05 | Uma leitura/path/rodada; paridade count; replay antes do Git sem perder guardas; ablação cold/warm com cache bytes. |
| 8 / BX-08 | Revisões e snapshot coerente de memória/contexto | BX-01/02 | Revogação/index/checkpoint concorrentes não publicam selo velho; ponto de linearização documentado. |
| 9 / BX-09 | Contrato de retenção, backup e restore | BX-08 | Backup restaurado com memórias/checkpoints/eventos; quota e pruning preservam CAS/replay dentro da janela declarada; fora da janela, erro definido. |
| 10 / BX-10 | Nome/config por projeto e matriz de harnesses | BX-01/02/04 | Dois projetos não colidem; handoff nativo Mac/Win; Antigravity explicitamente qualificado antes de divulgar suporte. |
| 11 / BX-11 | Corpus holdout e avaliação de tarefa aceita | BX-10 | Tarefas/aceite/modelos/custos fixados antes; pareamento, ablação, correlação e IC; nada de billing inferido do payload. |
| 12 / BX-12 | Autoridade local compartilhada opt-in | BX-06/08/09/10 e duplicação medida | IPC por usuário, grants por adapter, worker único supervisionado, fairness, idle, upgrade/rollback/owner collision. |
| 13 / BX-13 | Perfil símbolos/LSP e Laya estreito calibrado | BX-11 | Ganho de tarefa supera CPU/RSS/instalação; treinocalibraçãoholdout separados; sem alterar políticas obrigatórias. |
| 14 / BX-14 | Release OSS verificável e experiência de onboarding | BX-01..11 prioritários | Release/tag, source package, segurança/licenças/SBOM, instalação e demo externas; decisão explícita de publicar. |
| 15 / BX-15 | Mascote original e demonstração | Sem dependência do núcleo para vídeo | Prompt entregue; render depois; estado visual só reflete evento; personagem próprio, assets/sons originais. |

BX-07 não deve preceder correção de integridade. BX-12 não é requisito para corrigir o processo stdio. Caso não se observe duplicação do Laya/serviço, manter uma instalação local simples; não implementar daemon por prestígio arquitetural.
