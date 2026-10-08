# Alinhamento SDD por projeto

O BBrainX pode inspecionar a documentação de um projeto registrado e informar se ela contém uma estrutura de desenvolvimento orientado por especificação (SDD), quais artefatos estão presentes e quais relações documentais faltam. A operação não consulta APIs de harness nem importa histórico de chats; lê somente os artefatos documentais reconhecidos e, ao criar um rascunho, metadados locais selecionados. Não executa comandos encontrados nos documentos nem usa modelo para dar nota semântica.

## Usar

```sh
node bin/bbrainx.mjs sdd --project ID
node bin/bbrainx.mjs sdd --project ID --mode assess
```

`sdd --project ID` usa `ensure`: inspeciona a raiz registrada e, se não encontrar artefatos SDD reconhecíveis, cria nela um `SDD.md` marcado como rascunho. `--mode assess` somente lê e relata o estado. Abrir o painel ou indexar contexto não cria arquivos; no painel, a criação exige a ação explícita **Alinhar SDD**. Repetir `ensure` não altera o rascunho existente.

Se encontrar uma estrutura reconhecida, mesmo parcial, `ensure` a avalia sem criar um segundo documento concorrente. Em particular, uma constituição sem especificação de feature é SDD parcial. A criação nunca substitui arquivos, links simbólicos ou especificações existentes. O limite da raiz é a pasta canônica do projeto registrado. Se a inspeção atingir limites ou não conseguir inventariar com segurança, o resultado deve indicar incompletude e não concluir que a pasta está vazia.

Para integração por API, use `POST /api/invoke` com `{ "action": "sdd.align", "args": { "project": "ID", "mode": "assess" } }` ou `mode: "ensure"`. A chamada passa pela validação CSRF e pelos grants do host existentes. O servidor MCP publica `sdd_align` somente quando iniciado com `--sdd`; a ferramenta mantém a autoridade concedida pelo host. O modo `ensure` só cria após chamada explícita.

## O que é detectado e o que significa a nota

O inventário reconhece a convenção Spec Kit (`.specify/memory/constitution.md`, `specs/*/spec.md`, `plan.md` e `tasks.md`), documentos `SPEC.md` e `SDD.md`, e documentação sob `docs/specs/`. Um README isolado não caracteriza SDD. O Spec Kit usa `.specify/feature.json` para apontar a feature ativa, mas o BBrainX não lê esse metadado para escolher uma feature; agrupa os artefatos pelo caminho. Artefatos por feature são avaliados separadamente para não combinar requisitos de especificações distintas.

O campo `score` (0–100) é **cobertura documental** e traz `rubricVersion: "sdd-document-coverage-v1"`. Cada feature mostra uma nota e as dimensões `objective`, `requirements`, `architecture`, `acceptance`, `tasks` e `traceability`; cada dimensão informa `covered`, `points` e `max`. O relatório inclui lacunas, rastreabilidade, documentos com caminho relativo, SHA-256, bytes, tipo e feature associada, `limits.reached`, `completeInspection`, `status`, `created` e `revision.documentsSha256`.

O campo `semanticQuality` é explicitamente `"not_assessed"`. Uma nota alta não afirma que os requisitos estão corretos, que o plano é viável, que os testes foram executados ou aprovados, nem que o produto atende ao usuário. Títulos vazios, comentários e templates sem conteúdo substantivo não aumentam cobertura. O sistema não atribui aprovação semântica automática; revisão humana continua necessária.

O scanner não procura credenciais em todos os arquivos do projeto. Ele limita a inspeção aos caminhos documentais definidos, ignora nomes de arquivo conhecidos como sensíveis e recusa padrões comuns de credenciais quando aparecem no texto; esses filtros são heurísticos e não garantem que um documento selecionado esteja livre de informação privada. O relatório expõe caminhos, hashes e metadados, sem retornar o corpo dos documentos. Revise a pasta documental antes de avaliar se ela pode conter texto que não deve ser processado.

O relatório de `ensure` identifica o rascunho gerado como não revisado e distingue fatos inventariados de perguntas pendentes. Ele pode enumerar comandos de validação presentes nos metadados do projeto, mas não os executa. Se já houver SDD parcial, o relatório apresenta lacunas para orientar a continuação sem escrever outro documento.

## Referência de processo

O fluxo atual do Spec Kit estabelece a constituição uma vez e segue `specify → plan → tasks → implement → converge`. Para mudanças de produção, o guia também recomenda `clarify`, checklist e `analyze` como gates anteriores à implementação. A constituição viva fica em `.specify/memory/constitution.md`; `.specify/feature.json` seleciona o diretório de feature. Os artefatos ficam em `specs/[###-feature]/`: `spec.md`, `plan.md`, `tasks.md` e, conforme a feature, `research.md`, `data-model.md`, `quickstart.md`, `contracts/` e checklists. `analyze` compara spec, plano e tarefas em modo somente leitura; `converge` confere a implementação contra esses artefatos e acrescenta tarefas para gaps até declarar convergência. O BBrainX reconhece essa estrutura, mas não executa os comandos do Spec Kit nem declara uma feature convergida sem evidência correspondente.

MetaGPT serve como referência para a separação de papéis e entregáveis: gestão de produto, arquitetura, planejamento e engenharia aparecem como etapas conceituais e como artefatos distintos. O README lista papéis tradicionais, enquanto o código de composição atual instancia um conjunto diferente (`TeamLeader`, `ProductManager`, `Architect`, `Engineer2` e `DataAnalyst`); não se deve tratar cada papel do README como sempre ativo. A revisão de código do framework também é uma resposta de modelo, não uma aprovação independente. O BBrainX usa essa separação apenas como referência de processo e não incorpora o runtime ou as dependências MetaGPT.

Referências primárias consultadas em 2026-10-08:

- [Spec Kit: fluxo SDD atual](https://github.com/github/spec-kit/blob/1e933c49fd6d5d5390b28f18faefa5728c95b2e3/docs/quickstart.md)
- [Spec Kit: estrutura do plano e artefatos](https://github.com/github/spec-kit/blob/1e933c49fd6d5d5390b28f18faefa5728c95b2e3/templates/plan-template.md)
- [Spec Kit: análise somente leitura](https://github.com/github/spec-kit/blob/1e933c49fd6d5d5390b28f18faefa5728c95b2e3/templates/commands/analyze.md)
- [Spec Kit: convergência](https://github.com/github/spec-kit/blob/1e933c49fd6d5d5390b28f18faefa5728c95b2e3/templates/commands/converge.md)
- [Spec Kit: autoridade e atualização da constituição](https://github.com/github/spec-kit/blob/1e933c49fd6d5d5390b28f18faefa5728c95b2e3/docs/upgrade.md)
- [Spec Kit: licença MIT](https://github.com/github/spec-kit/blob/1e933c49fd6d5d5390b28f18faefa5728c95b2e3/LICENSE)
- [MetaGPT: visão de papéis](https://github.com/FoundationAgents/MetaGPT/blob/11cdf466d042aece04fc6cfd13b28e1a70341b1f/README.md)
- [MetaGPT: composição atual da equipe](https://github.com/FoundationAgents/MetaGPT/blob/11cdf466d042aece04fc6cfd13b28e1a70341b1f/metagpt/software_company.py)
- [MetaGPT: papéis](https://github.com/FoundationAgents/MetaGPT/tree/11cdf466d042aece04fc6cfd13b28e1a70341b1f/metagpt/roles), [ações](https://github.com/FoundationAgents/MetaGPT/tree/11cdf466d042aece04fc6cfd13b28e1a70341b1f/metagpt/actions) e [licença MIT](https://github.com/FoundationAgents/MetaGPT/blob/11cdf466d042aece04fc6cfd13b28e1a70341b1f/LICENSE)

Revisões consultadas: Spec Kit `1e933c49fd6d5d5390b28f18faefa5728c95b2e3` e MetaGPT `11cdf466d042aece04fc6cfd13b28e1a70341b1f`. Esses links são imutáveis. Não há código nem dependência desses projetos copiados para o BBrainX.

## Rubrica, limites e concorrência

A rubrica v1 distribui 100 pontos: objetivo/escopo 15, requisitos 25, arquitetura 15, aceite 20, tarefas 15 e rastreabilidade 10. Cada dimensão exige evidência textual substantiva nas seções reconhecidas; rastreabilidade exige IDs declarados em Requisitos e ligados a tarefas da mesma feature, sem referências órfãs. É uma heurística estática explicável. Rascunhos gerados têm teto 49 e `semanticQuality: not_assessed`; remoção manual do marcador não equivale a aprovação autenticada.

Limites: profundidade 4, 128 documentos, 64 KiB por arquivo, 512 KiB lidos por inspeção, 2.048 entradas visitadas, 256 IDs de até 80 caracteres. O resultado publica os tetos e razões de incompletude. As fontes adicionais do rascunho (`package.json` e `README.md`) têm limites por arquivo; o scanner não promete cobertura de convenções fora do catálogo. Não expandir quotas silenciosamente para melhorar uma nota. Operações de filesystem são síncronas; quotas limitam volume de trabalho, não garantem latência sob disco ou filesystem bloqueado (EV-06).

A criação usa abertura exclusiva e remove seu próprio arquivo parcial quando uma gravação falha, conferindo identidade para não apagar a substituição de outro processo. Uma avaliação concorrente pode observar o arquivo antes da conclusão da escrita e reportar uma fotografia parcial; uma nova avaliação lê o estado final. Guards de raiz, ancestrais, inode e symlink são defensivos, mas não constituem sandbox do SO nem garantia absoluta contra trocas transitórias por outro processo hostil com a mesma autoridade do usuário. Não executar repositórios não confiáveis como consequência da inspeção.

## Evidência desta entrega

A implementação local passou 451/451 testes no Node 24.21 e no Node mínimo 22.20, sem skips locais, build e 33/33 testes de navegador. [Manifesto de verificação](sdd-verification-2026-10-08.json) conserva hashes da árvore testada e dos logs; a execução foi sobre código ainda não commitado, explicitamente identificado. Testes reais de CLI, HTTP e MCP provaram criação/idempotência, CSRF e recusa entre projetos. Testes do scanner exercitaram árvores reais, concorrência entre processos e falha real de gravação com limpeza. Fixtures UI não são prova de geração semântica ou inferência de modelo.

Controles negativos em cópia descartável detectaram remoção da preservação de SDD existente e remoção do grant do projeto. Os checks de CI da revisão final e a instalação do runtime são evidências distintas; conferir a PR e `MAC_MINI.md` antes de promover a versão.
