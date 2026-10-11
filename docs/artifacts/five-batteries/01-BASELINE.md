# State Commit 01 — base, ciência e hipóteses falsificáveis

Consulta: 08/10/2026. Base remota confirmada: PR #18 aberto, head `cd7ab25111b9c24e27e1f023180f18de86d27a7b`; depende do PR #12. Não houve merge na main. A execução histórica desse head registrou 342/342 testes, Node24.21.0/Linux x64, 16.766.414.848 bytes de RAM e 4 CPUs lógicas. O arquivo `validation.json` do artefato `11578921091` identifica a revisão. Isso é uma baseline de testes, não benchmark de hardware MEDIUM foreground.

## Estado recuperado

Composição de bibliotecas, CLI limitado, worker com gerações e contrato de recibos já estão no head remoto. Cliente HTTP System One, decomposição de usage advisor e limitador circular existem como alterações locais recuperadas, ainda sem publicação/validação da combinação. A alegação anterior de 91 testes focados não certifica a árvore final. Serão reexecutados.

Duas lanes têm índices/checkpoints separados e leem memória aprovada comum. Entretanto, um limite em um objeto JavaScript não limita outros processos. Dois clientes locais apontando ao mesmo servidor podem dobrar a admissão; criar uma instância nova depois de timeout também perde a observação de resultado desconhecido. Esta é a principal lacuna a investigar.

## Matriz de fontes e transferência delimitada

| Fonte primária | Evidência lida | Uso no BBrainX / limite |
|---|---|---|
| Jev in the Wild, arXiv:2609.30216 | Registro, método e texto PDF; 2.170 projetos públicos coletados até 22/09/2026 | Taxonomia de decisões e integração; não mede nossa latência, calibração ou clones self-hosted. Classificação do corpus usa agentes e revisão; popularidade não é qualidade. |
| GLiNER, arXiv:2311.08526 | Registro e Tabela 1 inspecionada visualmente | Encoder NER e comparação restrita; não é paper GLiNER2 nem demonstra correção de código ou relação factual. |
| Laya model card | Checkpoints, contexto e limites publicados | Fixar pesos/tokenizer/idioma; confiança e resultado tipado não autorizam efeitos. O core continua no perfil instalado explicitamente, sem upgrade implícito. |
| razorback16/openjev @75f22b6 | README consultado por GitHub | Servidor opcional /v1/systemone com backends distintos; confiança por entropia não é probabilidade de acerto. Read extra pode não aparecer em usage. |
| openjev/openjev model card | Licença dos pesos CC-BY-NC-4.0, helpers Apache-2.0 | Projeto distinto do servidor acima; não habilitar pesos em perfil comercial sem verificar termos. |
| Anthropic advisor tool | Contrato de usage, streaming e cache | Somar agregado do executor com iterações advisor; não somar novamente iterações message. max_tokens do executor não limita advisor. |
| Anthropic server tools | pause_turn e chamadas mistas | Preservar estado e limitar retomadas; uma chamada pendente não foi necessariamente executada. |
| Anthropic memory tool | Handler client-side sob armazenamento do aplicativo | Não mapear create/replace para aprovação da memória BBrainX. Caminho e autorização são do host. |
| Anthropic tool reference | Tipos versionados, defer_loading, allowed_callers | Exportação opcional de contratos, não nova autoridade; catálogo pequeno não justifica tool search obrigatório. |
| Zanzibar (USENIX ATC 2019) | Publicação dos autores | Vincular leitura/publicação à revisão de autorização; não transferir SLO Google. |
| The Tail at Scale (CACM 2013) | Publicação dos autores | Medir filas, recusas e caudas; microbenchmark isolado não é tarefa completa. |
| Build Systems a la Carte (ICFP 2018) | Publicação dos autores | Dependências de derivados e condições de recomputação; hashes não comprovam semântica. |
| AWS Uses Formal Methods (CACM 2015) | Publicação dos autores | Modelar invariantes e contraprovas; teste finito não é prova ilimitada. |
| Guo et al., arXiv:1706.04599 | Abstract e escopo da calibração | ECE precisa de rótulos/resultados em população, não abs(maxProb-1/K) por pedido. |
| SQLite WAL | Documentação oficial | Transações curtas, writer único por banco, armazenamento local; sem NFS/iCloud de WAL vivo. |

O artigo Substack solicitado retornou cache miss; não atribuímos conteúdo não obtido ao autor. O material SDD fornecido foi lido: hashlib.blake3 não é API da biblioteca padrão, ast.dump recursivo em cada nó duplica trabalho, assert pode desaparecer sob -O, pós-condição após return não executa, ModuleType+exec não isola o processo e temporário de nome fixo colide. Essas são hipóteses de contraprova executável na bateria 3, não aplicação do código recebido ao produto.

## KPIs e critérios predefinidos

1. Correção: todos os testes do runtime concluídos, sem skip/cancelamento/TODO; paridade da janela circular com referência independente em eventos de fronteira; nenhum checkpoint de uma lane substituído pela outra.
2. Admissão multiprocesso: soma das reservas ativas/indeterminadas nunca excede os limites persistidos. Crash/timeout não devolvem capacidade sem reconciliação host-owned. Geração antiga não encerra reserva nova.
3. Custo: usage superior mais advisor apenas; desconhecido continua null. Fatura, economia financeira e acurácia de modelos permanecem não medidas nesta bateria sem inferência/recibos reais.
4. Performance: comparar Array.shift versus ring com sete repetições pareadas, ordem alternada, warmup separado e contagem de aceites idêntica; não fixar speedup antes de medir. Medir aquisição/liberação real SQLite e teste multiprocesso, com ambiente e volume registrados.
5. DX: instalação pelo lockfile, build e navegador; painel funciona sem rede/modelos e distingue observado, proposto e não verificado. Release não deve ser promovida com gate obrigatório pendente.

Não usamos números de papers como baseline de execução BBrainX. A comparação científica é de método e fronteira; a tabela de antes/depois virá das mesmas operações medidas no mesmo runner.

## Referências

https://arxiv.org/abs/2609.30216
https://arxiv.org/abs/2311.08526
https://huggingface.co/convaiinnovations/laya
https://huggingface.co/openjev/openjev
https://github.com/razorback16/openjev/tree/75f22b6dad8c360fdba0e0ebd3dc0a1187628f60
https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool
https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools
https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference
https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/
https://research.google/pubs/the-tail-at-scale/
https://www.microsoft.com/en-us/research/publication/build-systems-la-carte/
https://www.amazon.science/publications/how-amazon-web-services-uses-formal-methods
https://arxiv.org/abs/1706.04599
https://sqlite.org/wal.html
https://docs.python.org/3/library/ast.html
https://docs.python.org/3/reference/simple_stmts.html#the-assert-statement
https://reactflow.dev/learn/advanced-use/performance
https://ml4se.substack.com/p/como-o-jev-funciona-por-dentro
