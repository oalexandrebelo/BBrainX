# Especificação: alinhamento SDD por projeto

Estado: implementação autorizada pelo mantenedor em 08/10/2026. Este contrato descreve a nova capacidade do BBrainX; não concede permissão a documentos recuperados nem afirma que projetos de terceiros foram analisados.

## Objetivo e fronteiras

Oferecer a desenvolvedores e agentes uma operação explícita que detecta SDD no projeto autorizado, avalia a cobertura documental e cria uma base rastreável quando ele não existe. Um documento gerado a partir do repositório é um rascunho técnico, não uma especificação funcional aprovada. Não inventar objetivos comerciais, testes executados, donos, SLAs ou consentimentos.

## Requisitos

- FR-001: reconhecer Spec Kit (`.specify/memory/constitution.md`, `specs/*/spec.md`, `plan.md`, `tasks.md`), documentos `SPEC.md`/`SDD.md` e `docs/specs/`. Governança ou plano sem especificação indica SDD parcial; README isolado não prova SDD.
- FR-002: reportar projeto, formato, documentos por caminho relativo/hash, cobertura, lacunas, limites atingidos, rubrica versionada e nota 0–100. A nota se denomina **cobertura documental**; não certifica semântica, testes aprovados ou qualidade de código. Não contar só títulos vazios, comentários ou templates como conteúdo substantivo.
- FR-003: confrontar IDs explícitos de requisitos com referências nas tarefas quando o formato fornece esses IDs, expondo órfãos e cobertura. Não somar artefatos de features diferentes como se fossem uma especificação única. Resultados por feature precedem qualquer agregado.
- FR-004: modo `assess` é somente leitura. Modo `ensure` avalia e, somente na ausência de artefatos SDD, cria `SDD.md` na raiz autorizada. Criação exclusiva: nunca substituir arquivo existente, inclusive symlink, nem duplicar Spec Kit ou SDD parcial. Nova execução é idempotente.
- FR-005: base criada contém inventário comprovado, comandos declarados sem executá-los, fontes/hashes, limites, riscos e perguntas pendentes. Marcar rascunho; sua nota não equivale à aprovação e permanece limitada enquanto o conteúdo não foi revisado.
- FR-006: acesso autorizado somente à raiz canonical registrada, com recusa de symlinks detectados e revalidação de raiz, ancestrais e inode. Pular nomes sensíveis conhecidos; recusar padrões comuns de credenciais após ler o documento selecionado, sem expor seu corpo no relatório. Esses filtros são heurísticos, não garantem ausência de leitura de informação privada. Não executar scripts do repositório. Operações têm quotas de arquivos, profundidade e bytes; se o inventário for incompleto, não criar outro SDD por concluir falsamente que estava ausente.
- FR-007: CLI `sdd --project ID` executa ensure; `--mode assess` permite avaliação sem criação. Painel SDD por projeto permite avaliar e alinhar; alterações de projeto abortam resposta anterior. MCP opt-in `--sdd` publica `sdd_align`, com mode assess/ensure, preservando grants do host. Clientes sem opt-in mantêm o catálogo existente.
- FR-008: somente o usuário/host solicita criação. Abrir um painel, indexar contexto ou descobrir um workspace não cria arquivos. A ação **Alinhar SDD** efetua automaticamente a criação quando ausente. Laya não arbitra permissões nem notas desta rubrica.

## Arquitetura e comandos

Módulo puro de inspeção/rubrica e criação limitada em `src/sdd.mjs`; integração pelo engine existente, CLI e componente `web/SddPanel.jsx`. Nenhuma dependência de runtime MetaGPT/Spec Kit, nenhum download, migração SQL ou API paga. Referências guiam interoperabilidade de artefatos, não cópia integral de frameworks.

Build: `npm run build`. Testes: `npm test`; E2E: `npx playwright test --config playwright.config.mjs`, com home isolado e porta livre. Testes de referência usam árvores temporárias reais, sem chamar LLM. Estilo: módulos ESM, erros tipados existentes, validação de schema no engine e contratos JSON do produto.

## Critérios de aceite

- AC-001 → FR-001/002: detectar SDD ausente, parcial, Spec Kit e documento genérico; documento vazio/template não recebe cobertura plena; score determinístico e explicável.
- AC-002 → FR-003: duas features não emprestam requisitos/tarefas; referências órfãs e requisitos sem tarefas aparecem no relatório.
- AC-003 → FR-004/005: ensure em projeto sem SDD cria um único rascunho; segunda chamada não altera bytes; projeto com SDD mantém arquivos intactos.
- AC-004 → FR-006: nos cenários reproduzidos de projeto estrangeiro, raiz redirecionada, arquivo/diretório symlink estático, entrada grande e corrida de criação, recusar ou reportar inspeção incompleta sem escrever fora do escopo. Verificações de identidade não constituem sandbox do SO nem garantia absoluta contra trocas transitórias ABA por outro processo hostil com a mesma autoridade do usuário.
- AC-005 → FR-007/008: CLI, HTTP e MCP têm o mesmo resultado e autoridade; UI mostra nota/rubrica/lacunas, ausência e criação, erro, incompletude e estado de revisão; troca de projeto não mostra resultado anterior.
- AC-006: controles negativos em cópia isolada demonstram que testes detectam remoção do guard de escopo e da preservação de arquivo existente. Testes completos e build passam; evidência da árvore entregue é registrada separadamente.

## Plano e tarefas

- T-001 [FR-001, FR-002, FR-003, FR-006]: implementar leitura limitada, classificação por feature e rubrica; testar árvores reais e fronteiras.
- T-002 [FR-004, FR-005, FR-006]: geração verificável e criação exclusiva com revalidação da raiz; testar concorrência/idempotência e arquivos hostis.
- T-003 [FR-007, FR-008]: integrar contratos CLI/engine/HTTP/MCP e painel; provar isolamento e recusa de ações implícitas.
- T-004 [FR-001–FR-008]: revisão independente, testes completos, evidência, documentação operacional e continuidade.

## Limitações e decisões abertas

Uma inspeção estática não comprova correção de negócio ou execução de testes. Rubrica e limites devem constar no resultado e podem evoluir por versão, conservando a nota antiga com sua revisão. Aprovação humana e seleção de feature ativa não são inferidas de timestamps ou nome de branch. Integração com o loop de convergência do Spec Kit é próxima evolução, depois de validar este contrato.

Fontes primárias consultadas: [Spec Kit](https://github.com/github/spec-kit), [processo SDD](https://github.com/github/spec-kit/blob/main/spec-driven.md) e [MetaGPT](https://github.com/FoundationAgents/MetaGPT). Fixar hashes ao copiar ou depender de um artefato upstream; esta fatia não importa código desses projetos.
