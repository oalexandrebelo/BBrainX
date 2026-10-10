# Especificação delimitada: fechamento por evidências

Este candidato novo parte de `527359c6c2d354dfcc50b8c6bf3213cd0782ea9e` (State03A+03B). Não inclui nem finge recuperar o State03C ausente. O escopo é F01–F03 e uma ponte opcional de especificação/evidência, sem mudança de schema, dependência ou catálogo MCP.

## Requisitos

**FR-001 — Inicialização do ledger.** Primeiras aberturas concorrentes preservam a identidade e as quotas. A etapa idempotente de habilitação do WAL pode repetir somente contenção SQLite conhecida, dentro de prazo monotônico. Quota de negócio e execução externa nunca entram no retry.

**FR-002 — Sidecars voláteis.** Ausência legítima de WAL/SHM é permitida, mas symlinks, hardlinks, diretórios e modos inseguros não são aceitos. O contrato usa uma observação de metadados por arquivo, sem pressupor um snapshot do filesystem.

**FR-003 — Erro transacional.** SQLITE_FULL permanece identificável pelo chamador; rollback automático não pode ser encoberto por uma falha de limpeza. Não deixar linhas parciais; se o cleanup falha com transação aberta, retirar a conexão de uso.

**FR-004 — Especificação com escopo.** A ponte lê somente a feature e a worktree selecionadas pelo host. Não consulta estado global, não executa hooks nem altera configurações. Evidências de outro projeto/lane/revisão ou conjunto de documentos são recusadas.

**FR-005 — Compatibilidade.** Suíte existente, build e isolamento de duas lanes permanecem funcionais. O projeto não recebe dependências de produção adicionais.

**FR-006 — Instalação limpa.** Executar instalação pelo lockfile em ambiente autorizado, com cache vazio. Copiar dependências recuperadas não satisfaz este requisito.

**FR-007 — Navegador.** Executar os testes originais de interface na build Playwright correspondente e em ambiente autorizado. Rotas HTTP funcionais não substituem navegação.

**FR-008 — Uso alvo.** Testar macOS MEDIUM com dois harnesses autenticados e operações reais, mantendo evidência de recurso, isolamento e retomada. Uma CI Linux não satisfaz este requisito.

## Cenários de aceite

- Duas features não compartilham seletor mutável de feature ou task IDs como autoridade global.
- Um checkbox concluído sem recibo é pendência, não aceite. Um recibo verde de zero testes é inválido.
- Alterar spec, plan, tasks ou constituição invalida o digest da evidência anterior.
- Uma fonte ou um log alterado após a captura é detectado por revalidação; não se promete exclusão de escritores hostis com o mesmo UID.
- Resultados dos modelos e economia de provider permanecem não medidos nesta alteração.
