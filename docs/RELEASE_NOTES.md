# BBrainX 0.3.0 — Developer Preview

Núcleo revisto a partir de medições num repositório real. Sem dependência nova.

## Mudou

- **Busca:** a declaração de um nome vem antes dos usos e dos testes; identificador composto casa com suas partes (`eraseUserData` ↔ `erase_user_data`). Em 300 casos gerados automaticamente por repositório, o acerto em primeiro lugar foi de 38 % para 98 % (TypeScript) e de 42 % para 94 % (Python).
- **Arquivo alterado:** é relido antes de ser servido. O pacote deixa de falhar com `STALE_INDEX`, salvo no modo estrito (`context --strict`).
- **Indexação:** um arquivo por vez, tetos configuráveis pelo host (padrão 20.000 arquivos e 256 MiB). Primeira indexação de 3.662 arquivos: de 27,8 s para 3,2 s. Banco: de 96 MB para 61 MB.
- **Checkpoint:** aceita `done`, `decisions`, `blockers`, `filesTouched` e `evidence`. `snapshot` passa a ser opcional; o host carimba o snapshot, o commit e o ramo do Git.
- **Memória:** modo `relevant`, que só entra quando casa com o objetivo e é escolhido pelo humano na aprovação; proposta idêntica não duplica.
- **Avaliação:** `scripts/eval-retrieval.mjs` e `scripts/make-definition-cases.mjs`.
- **Erros:** as respostas trazem `detail` com a razão e a correção sugerida.

## Atenção ao atualizar

O banco é migrado na primeira abertura, com cópia íntegra em `brain.v1-backup.sqlite`. O índice de texto é descartado e precisa de `index` em cada projeto. Checkpoints, memórias e eventos são preservados. Roteiro e retorno em `docs/QUICKSTART.md`, seção 8.

Contratos alterados:

- `context_bootstrap` não recusa mais o pacote por arquivo alterado.
- O envelope de resposta ganhou o campo `detail`.
- `context_search` devolve os itens ordenados por `score`; o `rank` do BM25 continua no item.
- `context_index` devolve no máximo 100 itens em `skipped`, com o total por motivo em `skippedByReason`.
- Checkpoint com campo desconhecido é recusado também pela CLI (`INVALID_CHECKPOINT`). O teto de 16 KiB vale para o que é gravado, incluindo os campos do host.
- Registrar a mesma pasta com outro nome responde `PROJECT_ROOT_ALREADY_REGISTERED`.
- Padrões de credencial ampliados: arquivos com chave AWS, Google, Slack, Stripe de produção ou token fino do GitHub deixam de ser indexados.

## Não mudou

Nenhum modelo, gateway, daemon ou serviço externo foi introduzido. A análise de viabilidade das integrações está em `docs/FEASIBILITY.md`. Limite conhecido: a indexação roda numa única transação de escrita; durante a primeira indexação de um repositório grande, outra escrita no mesmo banco pode esperar e falhar por tempo esgotado.

---

# BBrainX 0.2.0 — Developer Preview

A local-first context and handoff layer for coding agents, with an inspectable React Flow workbench.

## Included

- SQLite/FTS5 persistent incremental text index, explicit project scope and verified source hashes.
- Invokta MCP stdio capabilities with structured inputs/outputs.
- Versioned durable checkpoints, idempotency and transactional event journal.
- Memory proposals with separate local approval/revocation.
- A bounded context compiler with actual o200k_base payload counts.
- macOS launcher, dependency doctor, exact npm lockfiles and reversible setup.
- Interactive architecture, working local context lab, research dossier and original Remotion presentation.
- CI evidence for native macOS, Windows and Linux, real independent MCP clients and Chromium desktop/mobile checks.

Download the source ZIP and verify SHA256SUMS. Read docs/QUICKSTART.md. Run npm run setup, npm run demo, then npm start.

## Scope

This is a developer preview, not a notarized Mac application or a production multi-tenant service. No model inference, provider cache savings, automatic desktop control or individual IDE certification is claimed. Optional model profiles remain opt-in research. The validation report names the exact tested revision and environment.

Source, screenshots, locks and the original video are included; installed node_modules, upstream reference checkouts, credentials and font files are not redistributed. Remotion has separate licensing. No private project data was used in tests.
