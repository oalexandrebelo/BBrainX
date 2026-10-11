# Executar a rodada MEDIUM / replay

Use a branch `feat/medium-workstation-replay`, num clone autorizado e com Node 24 LTS e Git. Nada deste guia exige chave de API, instalação de Laya, alteração de gateway ou treinamento.

## Isolar a revisão

```sh
git fetch origin
git worktree add ../BBrainX-medium origin/feat/medium-workstation-replay
cd ../BBrainX-medium
npm ci --ignore-scripts
npm test
npm run build
```

Não substitua a main antes da revisão e da CI. Não use `--no-verify`. A worktree tem o mesmo código do PR, mas estado de usuário não deve ser apontado para bancos reais durante experimentos de falha. Testes usam diretórios temporários próprios.

## Consultar os cinco perfis

```sh
node scripts/workstation.mjs profiles
node scripts/workstation.mjs profiles --profile MEDIUM
node scripts/workstation.mjs profiles --profile HIGH
node bin/bbrainx.mjs doctor
```

A saída distingue `capabilityCeiling` de `selected`. Um pedido acima do suporte retorna elegibilidade falsa; AUTO nunca sobe além de MEDIUM. `doctor` mantém os campos antigos e acrescenta `infrastructure`.

Os budgets não são limites RSS do SO e não alteram automaticamente `context --budget`. Não há download de modelo ou treinamento ao consultar perfis. Thermal desconhecido permanece desconhecido. Memória livre é uma observação transitória, não garantia de disponibilidade futura.

## Gerar configuração Codex por projeto

Depois de registrar uma raiz pequena e intencional:

```sh
node bin/bbrainx.mjs up --project meu-app --root /caminho/absoluto/meu-app
node scripts/codex-project.mjs --project meu-app
```

O helper retorna `target`, `text`, escopo e avisos. O target é `.codex/config.toml` na raiz registrada. Não escreve ou mescla arquivos. Preserve outras seções, servidores, credenciais e aprovações; valide confiança e chamada real no cliente. O comando antigo `config --client codex` mantém seu formato global nesta rodada, para não alterar esse contrato silenciosamente.

A conexão por projeto depende da raiz de configuração e da confiança do Codex. Um clone aninhado precisa de validação própria. A extensão Codex não usa automaticamente `.vscode/mcp.json` como substituto. Conferir que o servidor não aparece no outro projeto e conferir a recusa da allowlist são dois testes distintos.

## Replay de histórico

```sh
node scripts/workstation.mjs replay --file /caminho/historico.cases --strategy round-robin --steps 1000 --cost 10000
node scripts/workstation.mjs replay --file /caminho/historico.cases --strategy depth-first --steps 1000 --cost 10000
node scripts/workstation.mjs replay --file /caminho/historico.cases --strategy best-observed --steps 1000 --cost 10000
```

O formato está documentado em `src/replay.mjs` e exercitado em `test/replay.test.mjs`. A CI gera `demo-world.cases` com `origin: fixture`; esse arquivo é um exemplo de teste, não um histórico de qualidade real. Não publicar históricos privados ou respostas integrais do cliente.

O CLI recusa arquivos grandes, symlinks no caminho final e UTF-8 inválido. Ele não executa strings do arquivo. `SIGINT` solicita cancelamento cooperativo. Uma máquina abaixo do perfil mínimo ou sem headroom pode recusar o replay. Isso é admissão funcionando, não uma razão para falsificar o hardware de entrada.

O resultado informa ações reveladas, cobertura, custo representado, CPU do processo e wall time. `providerCalls` é zero porque não existe inferência nesse executável. `policyPromoted` e `weightsChanged` permanecem falsos. Custos faturados e acurácia global não são inferidos.

## Rodar as provas específicas

```sh
node --test test/workstation.test.mjs test/replay.test.mjs test/codex-project.test.mjs test/store-open.test.mjs test/native-memory.test.mjs
node scripts/workstation-evidence.mjs
```

Os logs e manifestos ficam em `artifacts/workstation/`. O benchmark usa dados gerados explicitamente e não se identifica como teste MEDIUM nativo.

Os controles negativos modificam temporariamente arquivos da própria worktree e os restauram. Execute somente num checkout isolado e limpo, com a base disponível no histórico:

```sh
node scripts/workstation-mutations.mjs
git diff --exit-code
```

## Revisar evidências MEDIUM

```sh
node scripts/workstation.mjs evidence --file /caminho/manifestos.json --revision SHA_DE_40_CARACTERES
```

O gate valida estrutura, identidade, limites e ausência de duplicatas. Não autentica relatos nem aprova marketing automaticamente. Não use testes de fixture para preencher o manifesto de lançamento. Consulte [BENCHMARK.md](BENCHMARK.md) para a coorte física e o workload foreground.

## Reverter e preservar contratos

Não há migração de banco ou alteração de pesos neste PR. Para interromper o uso, encerre os processos desta worktree e volte ao código anterior; não restaure um arquivo global de configuração inteiro sobre mudanças novas do usuário. A correção do startup mantém schema versão 2, hash e migrações existentes.

Permanecem pendentes: governador ligado a todo o runtime, coletor nativo de pressão/energia, daemon Laya compartilhado, geração automática de políticas, ledger verificado de requisitos, grafo/LSP e benchmark de tarefas MEDIUM. As bibliotecas implementadas não simulam que esses componentes já existem.
