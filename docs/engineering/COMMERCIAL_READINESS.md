# Preparação para licenciamento ou aquisição

O objetivo é tornar o BBrainX transferível, verificável e sustentável. Esta rodada preserva as duas opções — licenciar o produto ou negociar sua aquisição — sem alterar licença, titularidade, preço, visibilidade ou contratos. A condição atual continua **developer preview**, não um produto com SLA ou conformidade certificada.

## O que um terceiro deve conseguir verificar

| Área | Evidência disponível / mecanismo | Falta antes de uma promessa comercial correspondente |
| --- | --- | --- |
| Código e continuidade | Git, CI por revisão, contexto canônico, prioridades com aceite e template de PR. | Outro colaborador assumir uma tarefa e concluir instalação/correção sem auxílio do autor. |
| Distribuição | Manifesto v2 por blobs Git, árvore/versão/locks/modos, ZIP de ordem e timestamps fixos; `refs/replace` ignoradas. | Reconstrução independente em ambiente publicado e política de versão/release definida para cada distribuição. |
| Dependências | CycloneDX separados para raiz e mídia, gerados dos locks em CI e preservados com evidências. | Revisão de notices/licenças e escopo Python/modelo; SBOM não concede direitos nem autentica autoria. |
| Integridade | Testes de grants, quotas, idempotência, concorrência, rollback, MCP e controles negativos. | Exercício externo de segurança e recuperação de todos os bancos, com risco residual aceito pelo responsável. |
| Integração EV-12 | Plano por projeto, backup/rollback CAS, binding de workspace, MCP observado, painel e importadores históricos Claude/Cursor/Codex; 397 testes em Nodes 24/22.20, 18 E2E e implantação local em CONTINUITY. | CI da revisão entregue e instalação/retomada independente por cliente; presença de app/configuração não é certificação de conexão nativa. Antigravity IDE permanece manual-required. |
| Observação e orçamento | Metadata de conexão, testes locais explícitos, receipts importados e orçamento advisory por moeda/basis. | Cobertura real das chamadas do piloto e custos de assinatura/suporte; gastos não observados continuam desconhecidos. Não há bloqueio de gastos do provedor nem sandbox de execução. |
| Desempenho | Instrumentação pareada e contagens de trabalho; resultados negativos registrados. | Carga representativa, hardware/perfis definidos e metas de latência/RSS/CPU baseadas no uso real. |
| Valor de produto | Contexto local, continuidade aprovada, checkpoints, lanes e mensuração de uso. | Piloto com tarefas aceitas, baseline comparável, custo de operação/suporte e evidência de disposição a pagar. |
| Direitos e transferência | LICENSE e THIRD_PARTY_NOTICES descrevem os escopos declarados; histórico de contribuição disponível. | Confirmar cadeia de direitos de código/assets/contribuições, termos de ferramentas/modelos e condições da entidade adquirente/licenciada. |

## Cadeia de dependências

O inventário de 07/10/2026 gerou 159 componentes CycloneDX na raiz e 287 na mídia. A raiz inclui dependências de desenvolvimento; não são 159 dependências do runtime. A SBOM de mídia lista 17 componentes Remotion como `UNKNOWN`: essa classificação não deve ser convertida automaticamente em MIT nem em proibição. Conferir o texto da versão travada e a elegibilidade da entidade/uso. O perfil Laya tem Python e pesos fora dos locks npm; o SBOM npm não os cobre.

O workflow gera `artifacts/sbom-root.cdx.json` e `artifacts/sbom-media.cdx.json`. Na publicação de evidências em main, os arquivos são preservados em `docs/validation/`. Conferir seus hashes/locks e revisão junto ao relatório de CI. Timestamps/identificadores gerados pelo npm podem variar: a alegação de ZIP reproduzível não significa SBOM byte a byte idêntica.

## Pacote fonte reproduzível

Em checkout com Git, Node e Python 3: `node scripts/package.mjs` e `python3 scripts/archive.py`. O conteúdo vem do commit HEAD, inclusive quando a árvore local está suja; alterações não commitadas não entram. O manifesto v2 mantém `commit` e `files` para consumidores existentes e acrescenta árvore, versão, origem dos bytes, modos e hashes dos locks. Symlinks/submódulos são recusados, não seguidos ou silenciosamente perdidos.

O ZIP usa nomes ordenados, timestamp do commit em UTC e modos do Git; o timestamp é limitado ao intervalo suportado pelo ZIP, com o valor original no manifesto. O teste compara duas construções e confere cada entrada/hash. A compressão ainda depende de Python/zlib: reconstrução byte a byte entre versões dessas ferramentas precisa de ambiente fixado e verificação independente. A dupla ZIP/checksum não é uma transação de filesystem: publicar somente após ambos concluírem e conferirem.

Manifestos e checksums não constituem assinatura de origem. Atestações de artefatos são uma próxima proteção possível; não estão habilitadas nem se declara nível SLSA. A tag `v0.4.0-preview` existente é histórica. Não sobrescrevê-la nem assumir que um novo commit virou release; uma versão futura exige atualização explícita dos metadados e do fluxo de publicação.

## Primeiro piloto

Escolher um problema concreto com um usuário autorizado, por exemplo retomar uma alteração entre sessões sem perder decisões aprovadas. Fixar antes da execução: tarefas, critério de aceite independente, baseline, modelo/harness, perfil de hardware, dados autorizados e custos incluídos. Medir conclusão aceita, regressões, tempo total, recibos completos e custo de suporte; preservar falhas e casos sem melhoria. Não usar o corpus do próprio projeto como prova de vantagem universal.

Antes de prometer recuperação ou operar dados de clientes, ensaiar backup/restore do conjunto núcleo + usage + registry + lanes + arquivos privados de control/imports/integrações em ambiente isolado, medir perda possível e tempo de retorno, documentar permissões e falha parcial. O arquivo de resultados de testes é recuperável, mas não tem quota global de disco nem inclusão automática no backup do núcleo. Históricos originais importados e backups de configuração podem conter dados sensíveis; exigir política de retenção/transferência aprovada pelo operador. Antes de contratar SLA, definir suporte, janela de atualização e política de vulnerabilidades com capacidade real de atendimento.

Decisões comerciais e de direitos dependem do titular e dos termos aplicáveis; esta é uma preparação técnica, não uma validação jurídica ou estimativa de valor de venda. Próximos passos executáveis e dependências estão na [fila](ROADMAP.md).

## Fontes primárias consultadas em 07/10/2026

- [npm sbom](https://docs.npmjs.com/cli/commands/npm-sbom/): formatos e geração a partir do lock.
- [Git replace](https://git-scm.com/docs/git-replace): objetos de substituição e `--no-replace-objects`.
- [Licença Remotion v4.0.532](https://github.com/remotion-dev/remotion/blob/v4.0.532/LICENSE.md) e [SPDX MIT](https://spdx.org/licenses/MIT): escopos e termos; não provam titularidade do projeto.
- [Atestações GitHub](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations) e [SLSA 1.2](https://slsa.dev/spec/v1.2/): procedência é distinta de inventário ou hash.
- [SQLite Online Backup](https://sqlite.org/backup.html): referência para cópia consistente; o ensaio de restauração do produto continua necessário.
