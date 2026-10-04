# BBrainX 0.4.0 — Developer Preview

Motor e servidor MCP próprios, busca em linguagem natural entre português e inglês, perfil Laya instalável e o mapa do estudo. Duas dependências a menos.

## Mudou

- **Motor e MCP próprios.** `@invokta/core`, `@invokta/mcp` e, com eles, o SDK oficial do MCP saíram da execução. Pacotes de produção no lockfile: de 121 para 25. O contrato segue o modelo do Invokta (aviso MIT completo em `THIRD_PARTY_NOTICES.md`); o cliente oficial continua nos testes, como prova de interoperabilidade.
- **Duas eras do MCP.** O servidor atende a revisão corrente (2026-07-28, sem handshake, com `server/discover` e metadados por requisição) e as revisões com `initialize` (de 2024-11-05 a 2025-11-25) no mesmo processo.
- **Busca em linguagem natural.** Dois estágios somados: termos exatos e, com metade do peso, os mesmos termos por radical e por um glossário de programação português → inglês. Palavras vazias saem da consulta quando sobra algum termo que discrimina. Em 79 perguntas cegas sobre dois repositórios de terceiros, o arquivo esperado ficou entre os 10 primeiros em 84 % dos casos (antes, 54 %) e em 1.º em 46 % (antes, 33 %).
- **Pacote de contexto.** Documentação fica com no máximo metade do orçamento enquanto houver código candidato.
- **Um passo para começar.** `bbrainx up --root <pasta>` registra, indexa e mostra como ligar cada harness. `doctor` passa a informar o melhor cenário da máquina. `config --client` imprime a configuração de Claude Code, Codex, Cursor, VS Code e Gemini CLI.
- **Perfil Laya.** `bbrainx laya install | status | ask | remove`: ambiente Python isolado, pesos fixados por revisão e SHA-256, processo sem rede. Medido no M5 Pro: não melhora as duas decisões testadas sem ajuste fino, então não altera o pacote.
- **Avaliação.** O relatório informa intervalo de confiança de 95 % e o snapshot do corpus. `scripts/laya-bench.mjs` mede o perfil contra o caminho determinístico.
- **Mapa do estudo.** Nova aba do painel e `docs/STUDY_MAP.md`, gerados da mesma fonte: 37 ferramentas em cinco situações, com o porquê de cada uma.

## Corrigido

- Uma chamada cancelada antes de começar ainda executava, e a rejeição ficava sem dono: chamada e cancelamento no mesmo bloco de leitura derrubavam o servidor. Reproduzido, corrigido e coberto por teste com processo real.
- Requisição cancelada recebia resposta; a especificação pede que não receba mais nenhuma mensagem.
- Uma linha completa acima do limite, dentro de um único bloco de leitura, era aceita.
- `init` com a mesma pasta e outro nome já devolvia erro claro na 0.3; `up` agora reaproveita o nome que a pasta já tem.

## Contratos que mudaram

- **Recusa do domínio vira erro de ferramenta.** Quando o resultado traz `ok:false` (conflito de versão, índice ausente, orçamento insuficiente), a resposta MCP passa a vir com `isError: true`. O envelope `ok/data/error/detail` continua igual.
- **`TIMEOUT` é um código novo**, distinto de `CANCELLED`.
- **Limite de chamadas.** Mais de 300 chamadas de ferramenta por minuto recebem `RATE_LIMITED` como erro de ferramenta.
- **Identificador de requisição** precisa ser texto ou inteiro; número fracionário é recusado.
- **Fim da entrada padrão** cancela o que estiver em andamento e encerra o servidor, sem esperar.
- **`selection`** do pacote passa de `lexical-ranked` para `lexical-ranked-with-doc-quota`.
- **A busca devolve mais resultados** para a mesma consulta, porque passa a casar por radical. Quem dependia de «só os arquivos com a palavra exata» precisa filtrar.
- A revisão `2024-10-07`, que nunca foi publicada, saiu da lista de versões aceitas.

## Não mudou

O esquema do banco é o mesmo da 0.3 (versão 2): não há migração. As seis ferramentas, os nomes e os argumentos são os mesmos. Nenhum comando altera a configuração dos harnesses.

## Limites desta versão

- O prazo de uma chamada não interrompe trabalho síncrono: uma indexação longa segue até o fim e o servidor não lê a entrada enquanto ela roda.
- Qual era do protocolo cada harness usa hoje não foi medido. O cliente oficial da linha 1.x prova a era com handshake; a era sem handshake é provada por testes próprios, com o fio cru.
- O glossário português → inglês foi escrito por quem viu os casos deste repositório; o ganho foi confirmado depois em perguntas cegas, mas o conjunto é pequeno.
- Esta rodada não teve revisor independente. Os testes novos foram provados por sabotagem (28 defeitos injetados, todos detectados).

---

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
