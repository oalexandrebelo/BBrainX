# Integração por projeto — EV-12

Base: `3bb09b0ea68763cc5dd708446ed9d8a4fab5b3bb`, 08/10/2026. O mantenedor autorizou estudo, implementação, testes no Mac mini e commits. Esta especificação registra o escopo dessa autorização; não concede trust, credenciais ou aprovação automática de ferramentas.

| Módulo | Responsabilidade | Dependências |
| --- | --- | --- |
| workspace-binding | Raiz canônica, projetos sem sobreposição, lanes e autoridade por processo | núcleo existente |
| harness-installation | Descoberta, plano, aplicação com backup/CAS e rollback | workspace-binding |
| local-observation | Atividade BBrainX e resultados de testes explicitamente instrumentados | workspace-binding |
| context-import | Descoberta de workspaces e importação delimitada do histórico Claude, Cursor e Codex | workspace-binding |
| control-panel | Projeto, harnesses, lanes, checkpoints, testes e custos | módulos anteriores, usage existente |

Ordem: binding → instalação/observação/importação → painel → validação e implantação. Implementação incremental, com ownership por arquivo e revisão por outro colaborador. Os critérios abaixo são contratos por módulo; a fila canônica continua em `docs/engineering/ROADMAP.md`.

## workspace-binding

Um processo MCP recebe projeto, workspace e lane do host. Argumentos de ferramentas não ampliam esse grant. Configurações novas exigem cwd dentro da raiz canônica e recusam raiz substituída ou projeto aninhado distinto. Projetos diferentes não compartilham índice, checkpoint, memória ou recibos. Worktrees do mesmo Git comum podem compartilhar somente a autoridade de memória aprovada; seus índices e checkpoints permanecem separados. Dois harnesses na mesma raiz usam o mesmo estado persistente e tarefas distintas.

Aceite: A não lê/grava B; sibling-prefix, symlink e raiz sobreposta recusados; checkpoint CAS/replay preservados; overview de lanes somente leitura, sem criar bancos. Cwd é identidade de arranque, não attestation de uma sessão remota. Antigravity global sem cwd confiável não é uma integração por projeto comprovada.

## harness-installation

`bbrainx integrate --root /raiz --project ID` apresenta plano sem segredos; `--apply` registra a raiz e aplica somente formatos suportados. `bbrainx integrations rollback --id ID` restaura apenas arquivos que ainda correspondem à aplicação. Descoberta observa executáveis/extensões, sem ler autenticação. JSONC/TOML preservam entradas vizinhas. Arquivo alterado, symlink, colisão de servidor e formato inválido recusam mutação. Não há instalação silenciosa de extensões de terceiros ou alteração de gateway.

Aceite: plano não escreve; segunda aplicação idempotente; backup privado; rollback CAS; erro parcial tem recibo recuperável; configuração identificável como BBrainX. Nome/logo só aparecem nas superfícies oferecidas pelo cliente; detecção não significa conexão. OmniRoute é provedor do Kilo, independente do MCP BBrainX.

## local-observation

Metadados de processos MCP locais identificam projeto, workspace, harness, última atividade e falha sem guardar argumentos ou resultados. Processos terminados abruptamente expiram como stale, sem permanecer verdes. Testes são executados somente por comando explícito do operador, com diretório e limites declarados; não há ferramenta MCP de execução arbitrária. Resultado de processo, contagem do runner e checkpoint declarado são evidências distintas.

Aceite: limites de escrita/leitura/retenção; nenhuma soma de custos informados e estimados; desconhecido nunca vira zero. Progresso parcial e falha preservados. Execução local não equivale a sandbox de SO. Não instalar ClickHouse, Langfuse ou microVMs sem necessidade medida. A extensão do painel consome o ledger existente e informa a cobertura.

## context-import

Descoberta de pastas usa metadados dos harnesses/editores, distingue aberta, registrada e histórica. Não adivinha identidade pelo nome de diretório. Importação pelos drivers Claude, Cursor e Codex é explícita, local e ligada ao cwd de origem; rejeita ambiguidade entre projetos, limita bytes/mensagens e respeita compactação. Conteúdo é evidência não confiável, nunca instrução privilegiada ou memória aprovada. Não importar credenciais, hooks ou aprovações.

Aceite: projeto A não admite sessão de B; metadados/listagem não incluem transcrições; importação repetida idempotente; contexto ativo limitado, truncamento explícito; fonte original não é modificada. Não prometer cópia de estado interno do modelo ou de cache do provedor.

## control-panel

Painel local com marca BBrainX, seletor inequívoco de projeto/raiz, atividade observada, lanes, tarefas, testes, diagnóstico e ledger monetário. Ao trocar de projeto, limpar dados antigos e cancelar requisições pendentes. Atualização automática opcional, suspensa em página oculta. API só loopback e controles existentes Host/Origin/CSRF; não é servidor multi-tenant.

Aceite: interface acessível em desktop/mobile; estados vazio/erro/desconhecido; resposta atrasada não mistura projetos; E2E com servidor e SQLite reais.

## Implementação e verificação

Node 24 recomendado (mínimo 22.20), ESM, React existente. Usar `ensure(condition, 'ERROR_CODE')`, IDs validados, paths canônicos, limites antes de materializar conteúdo. Módulos em `src/`, testes Node em `test/`, UI em `web/`, E2E em `e2e/`. Não registrar dados privados da estação no Git. Dependências novas apenas para parsing correto de formatos existentes.

Comandos: `node --test test/workspace.test.mjs test/integrations.test.mjs`, `npm test`, `npm run build`, `npm run test:e2e`. Ampliar testes focados com cada módulo. Registrar versão testada, ambiente, limitações e rollback no handoff. Esta entrega não promove o preview a release comercial nem demonstra economia financeira ou desempenho de modelos.
