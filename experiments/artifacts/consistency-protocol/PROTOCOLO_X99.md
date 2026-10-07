# Protocolo X99 — estudo integral preservado em quatro partes

O estudo original de 05/10/2026 foi dividido somente em limites de linha para facilitar publicação e revisão. A concatenação ordenada dos quatro arquivos deve reproduzir os 74.278 bytes originais, SHA-256 `ba26233998fe96a9944ded7b30175a23046826a17e74520938f4904bccf73d29`. `parts.json` fixa hashes e intervalos; a CI verifica a identidade antes de distribuir a versão reunida.

1. [Fundamentos, auditoria do anexo, SuperTokens e Infisical](parts/01-foundations.md) — linhas 1–196.
2. [Orçamento, Medusa, SigNoz, Unkey e identidades de memória](parts/02-budget-and-memory.md) — linhas 197–413.
3. [Invalidação, cache, Laya, reclamation e dimensionamento](parts/03-cache-laya-and-scheduling.md) — linhas 414–592.
4. [Distribuição, escrow, falhas, avaliação e referências](parts/04-distribution-and-evaluation.md) — linhas 593–794.

As marcações Sxx nas partes usam as [referências comuns](REFERENCIAS.md). A última parte também preserva as definições Markdown do original. Os estados “não publicado” e “não integrado” são os da rodada original; esta consolidação publica o laboratório, mas não o habilita como mecanismo de produção. Novas execuções possuem relatórios separados na CI.
