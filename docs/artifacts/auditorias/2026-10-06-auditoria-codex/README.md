# BBrainX — auditoria integral de 6 de outubro de 2026

Revisão main `a9636e9402e3fa673ae05b3489202da1048aef5e`, produto 0.4.0. PR #6 `2c87f61c3d6355adf61e8675e2f3ee96c5cb2489`. Leitura integral dos seis news, código/documentos, GitHub, bancada real e revisão independente. Entrega documental local; sem mudanças do produto, configurações, merge ou publicação.

## Documentos

- [Dossiê completo](DOSSIE-COMPLETO-BBRAINX-2026-10-06.md): decisões, resultados, arquitetura, caches, falhas, documentação integral analisada, PR, ecossistema e mascote.
- [Backlog e aceite](BACKLOG-IMPLEMENTACAO.md): 15 unidades propostas; issues não foram abertas.
- [Revisão da PR #6](PR6-REVIEW.md): 15 arquivos, P1 pipeline, P2 teclado, testes e limites.
- [Prompt integral do mascote](PROMPT-MASCOTE-REMOTION.md): Remotion existente; personagem original científico de cabelo branco; oito estados; alpha, determinismo e orçamento de recursos; alternativa OpenMontage qualificada.
- [Reprodução e comandos](REPRODUCAO.md): isolamento, códigos de saída e limites.
- [Revisão independente](sections/revisao-final.md) e [correções aplicadas](RESPOSTA-REVISAO.md).
- [Manifesto de integridade](MANIFEST.json): revisões, SHA-256, bytes e escopo.

## Evidências

- [Leitura integral e hashes](evidence/leitura-news.json).
- [Runtime, escala, CAS, crash, raiz e compactação](evidence/runtime-audit.json).
- [Tokenizador e long pretoken](evidence/tokenizer-audit.json).
- [Laya real e qualidade](evidence/laya-real-benchmark.json), [pesos/recursos](evidence/laya-resource.json).
- [PR: 125 blobs coincidentes](evidence/pr6-tree-verification.json), [teste de teclado estático](evidence/pr6-static-browser.json).
- [Pipeline sem pipefail](evidence/pipeline-proof.json).
- [GitHub com metadados sanitizados](evidence/github-repository.json).

As fontes primárias e os limites estão junto às afirmações no dossiê. JSON/logs não são prova de tarefa nativa homologada, liderança OSS ou economia de cobrança. Scripts em reproduce são os utilizados na cópia temporária, com caminhos da bancada explicitamente documentados.
