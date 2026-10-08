# ADR-0001 — Contexto versionado e evidência por revisão

Status: aceita para o processo de engenharia. Data: 07/10/2026.

## Contexto

O projeto acumulou estudos, PRs sobrepostas, laboratórios e resultados de revisões diferentes. O handoff antigo já diverge da integração atual. Uma nova sessão não pode depender da memória de outro agente nem tomar um relatório histórico como aprovação do código presente.

## Decisão

Usar `docs/engineering/CONTINUITY.md` como entrada operacional, `ROADMAP.md` para prioridades/aceite e o Git/CI para identidade e prova. `npm run project:status` reúne somente metadados locais, sinaliza alterações e qualifica o relatório encontrado. Relatório local não é atestação criptográfica nem autorização de publicação.

Cada contribuição deve registrar a pergunta, fonte primária, reprodução ou medição, decisão, resultado e próxima ação. Manter tarefas pequenas e revisáveis; pesquisas amplas só viram dependência ou runtime após demonstração de necessidade. Preservar resultados negativos para evitar repetir tentativas sem ganho.

## Alternativas consideradas

- Usar apenas chats: perde rastreabilidade entre colaboradores e revisões.
- Introduzir banco/orquestrador de tarefas próprio: aumenta superfície de manutenção sem resolver uma necessidade demonstrada.
- Copiar todos os estudos em cada prompt: aumenta custo e mistura decisões vigentes com hipóteses antigas.
- Documentação apenas manual sem Git/CI: permite apresentar evidência velha como atual.

## Consequências

O contexto viaja com o código e pode ser usado por pessoas ou agentes de qualquer fornecedor. Exige atualização dos itens e revisão das evidências em cada PR. Não substitui gestão comercial, contrato com colaboradores, proteção da branch ou revisão de direitos. Não cria processo autônomo que altera o produto sem contribuições revisadas.

## Fontes e escopo

- [NIST SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final): referência para práticas de desenvolvimento, proteção de componentes e preservação de releases. Usada para orientar rastreabilidade; não se declara certificação ou conformidade integral.
- [Templates de PR do GitHub](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository): mecanismo nativo para transmitir critérios ao colaborador. O template orienta; não substitui checks obrigatórios.

Consultadas em 07/10/2026. Reavaliar a decisão quando o fluxo real exigir gestão de dependências que Git/PRs/documentos não consigam representar de forma simples.
