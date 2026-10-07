# BBrainX Observatory — tokens, contexto e custo com evidência

**Data:** 7 de outubro de 2026. **Base:** `a9636e9402e3fa673ae05b3489202da1048aef5e` (0.4.0). **Natureza:** extensão candidata de medição e visualização, sem nova dependência de produção. Não incorpora os PRs do Atlas ou MEDIUM/replay, nem o patch X99 de worker/cache, somente por citá-los.

Leia [pesquisa e arquitetura](RESEARCH.md), [auditoria Strata](STRATA.md) e [fontes](SOURCES.md). Resultados desta implementação só valem quando vinculados à sua revisão e execução de CI. Não inventar números de economia ao publicar screenshots.

## 1. O que está implementado

Página local `/observatory/`, API somente de leitura `/api/usage?project=ID`, ledger SQLite separado para recibos finais importados, adapters explícitos para seis formatos, comparação declarada de execuções aceitas, preços opcionais versionados e exportação/importação de relatório. O compilador existente ganha medição opt-in da redução local e evita algumas retokenizações desnecessárias sem aproximar BPE.

O painel não intercepta chamadas dos editores, não acessa contas de provedores, não troca endpoints, não coleta transcripts, não instala Laya ou Strata e não executa treinamentos. Os contadores de modelos vêm de metadados finais fornecidos explicitamente pelo operador. O resultado de uma capability MCP não contém automaticamente o uso de tokens consumidos pelo harness ao interpretá-lo.

Ausência de integração é ausência de dado. A tela usa `—` e campos `null` em vez de apresentar consumo zero. Uma contagem de zero é exibida quando foi efetivamente informada ou derivada de parcelas conhecidas compatíveis. Custos de assinatura, energia, ferramentas, armazenamento e impostos não são estimados a partir de tokens.

## 2. Abrir e usar

No checkout que contém esta extensão, com Node suportado pelo projeto:

```sh
npm ci --ignore-scripts
npm test
npm run build
npm start
```

Abra `http://127.0.0.1:4317/observatory/`. A página principal continua em `/`. Registre previamente uma raiz intencional pelo CLI normal, no mesmo `BBRAINX_HOME`. Não registre todo o diretório pessoal para alimentar o dashboard.

### Medição local de contexto

O flag precisa estar no processo que compila o contexto, não somente no processo que exibe o painel:

```sh
BBRAINX_MEASURE_CONTEXT=1 node bin/bbrainx.mjs context --project meu-app --query "validação de sessão" --budget 4000
npm start
```

No macOS/Linux, configure esse ambiente também no servidor MCP específico caso queira medir suas compilações. No PowerShell, use `$env:BBRAINX_MEASURE_CONTEXT='1'` antes de iniciar o processo. O BBrainX não altera as configurações dos harnesses para fazer isso. Compilações antigas continuam sem uma referência; não há reconstrução retrospectiva fictícia.

### Recibos e comparação

```sh
node scripts/usage.mjs import --project meu-app --file /caminho/privado/recibos.json
node scripts/usage.mjs compare --project meu-app --file /caminho/privado/par.json
node scripts/usage.mjs report --project meu-app > /caminho/privado/relatorio.json
```

O comando `import` aceita um array de até 100 registros `{expectedVersion, call}`. O projeto é resolvido pelo host e validado contra o catálogo; não é aceito dentro do recibo. Arquivo de até 1 MiB, UTF-8 estrito, regular, com rejeição de symlink final e conteúdo que cresce além do limite durante leitura. Não há scanner de arquivos pessoais.

Exemplo **sintético**, não um recibo real nem uma tabela comercial:

```json
[
  {
    "expectedVersion": 0,
    "call": {
      "schemaVersion": 1,
      "callId": "exemplo-tentativa-1",
      "account": "conta-local-identificador-nao-secreto",
      "provider": "openai",
      "model": "modelo-exemplo",
      "harness": "harness-exemplo-v1",
      "task": "AUTH-1",
      "run": "baseline-1",
      "snapshot": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "configurationHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "occurredAt": "2026-10-07T00:00:00.000Z",
      "format": "openai-responses",
      "usage": {
        "input_tokens": 1000,
        "input_tokens_details": {"cached_tokens": 600, "cache_write_tokens": 0},
        "output_tokens": 200,
        "output_tokens_details": {"reasoning_tokens": 50},
        "total_tokens": 1200
      },
      "terminal": true
    }
  }
]
```

Substitua identidade e contadores por metadados efetivamente observados. Se o provedor não entregou `cache_write_tokens`, omita o campo ou use `null`; não copie o zero ilustrativo. O normalizador não aceita a resposta completa, prompts, headers ou credenciais. Nem `sourceDigest` nem `terminal:true` autenticam o relato: origem e completude continuam declaradas pelo importador.

`pricing` é opcional. Seu contrato exige ID, moeda, provedor, modelo, formato, validade, referência, `scope: "uniform-text-token-only"` e tarifas decimais por milhão de tokens. Não há uma lista automática de preços que possa envelhecer silenciosamente. `reportedCost` tem contrato separado `{currency, amount, reference}`. Um preço em USD não pode ser somado a BRL, nem custo informado ser somado ao custo estimado da mesma chamada.

## 3. As quatro grandezas

### 3.1 Consumo final importado

Os adapters são específicos: `openai-responses`, `openai-chat`, `anthropic-messages`, `gemini-generatecontent`, `strata-responses` e `strata-chat`. Os dois últimos usam `provider: "strata-local"`, não `openai`. Formato de API compatível não torna o modelo local um produto tarifado da OpenAI.

A unidade normalizada contém entrada total, entrada não cacheada, leitura de cache, criação de cache, saída total, detalhe de raciocínio e total. Campos desconhecidos são preservados. Total inferido só é permitido quando suas parcelas necessárias são conhecidas. Inteiros negativos, não finitos, acima do limite por recibo e somas incompatíveis são recusados.

Na API OpenAI, tokens em cache são parte da entrada. Nas revisões que expõem criação de cache, a partição não cacheada é `inputTotal - cacheRead - cacheWrite`. Raciocínio é parte da saída, não uma parcela adicional. [R01]

Em Anthropic, `input_tokens` é a parcela não cacheada; leitura e criação precisam ser acrescentadas para formar o total de entrada. Quando fornecidos, os buckets de criação de cinco minutos e uma hora precisam somar a criação total. `iterations` não é somado novamente aos campos agregados. Casos de uso de ferramentas de servidor, geografia, service tier e iterações ficam fora da estimativa monetária uniforme. [R02]

Em Gemini, prompt inclui cache; saída normalizada reúne candidatos e pensamentos quando ambos foram informados. Não preencher pensamentos ausentes com zero. Criação de cache em endpoint separado não é uma cobrança de criação desta chamada `generateContent`. Modalidades ou ferramentas que exigem outra fórmula recusam a estimativa simplificada. [R03]

Streaming não foi integrado: o operador importa o usage terminal consolidado. Deltas não são recibos finais. Cada retry executado precisa de um `callId` próprio; o ID lógico da tarefa não deve colapsar tentativas faturadas diferentes.

### 3.2 Cache informado

A taxa ponderada é `soma(cacheRead)/soma(inputTotal)` apenas nos recibos em que ambos são conhecidos. Não é média das porcentagens por chamada. O painel informa cobertura. Um hit não significa token gratuito nem redução causada pelo BBrainX. Também não prova que a resposta inteira veio de um cache de respostas.

Ao agrupar diferentes modelos, o total é uma soma operacional de suas unidades reportadas, não uma quantidade semanticamente uniforme de texto. Por isso o painel preserva provedor, modelo e harness nos grupos.

### 3.3 Redução local

Com `BBRAINX_MEASURE_CONTEXT=1`, o compilador conta uma referência composta do mesmo cabeçalho obrigatório e da janela de candidatos já recuperados, antes do orçamento, deduplicação e quota de documentação. Não é todo o repositório, nem uma baseline de agente sem BBrainX.

A referência é limitada a 64 KiB de UTF-8. Acima disso, o valor fica desconhecido e o pacote continua funcionando. A contagem usa o mesmo `gpt-tokenizer/encoding/o200k_base` fixado no projeto, nunca bytes divididos por quatro. A diferença pode ser negativa; não é truncada em zero. Os eventos armazenam apenas IDs, hashes e contagens, sem query ou corpos de arquivos.

Uma compilação não comprova entrega ao modelo. Somar pacotes gerados representa atividade local, inclusive repetições; não deve ser interpretado como tokens faturados evitados. O flag introduz tokenização adicional para medição e, por isso, é opt-in.

### 3.4 Custo e diferença pareada

O ledger conserva dois eixos: custo informado no recibo e custo calculado segundo a tarifa fornecida. A moeda é parte da identidade do grupo. Tarifas uniformes não abrangem long-context pricing, batch discounts, multimodalidade, assinaturas, impostos, câmbio ou ferramentas; o operador precisa fornecer uma tarifa aplicável, e casos reconhecidos como não suportados ficam sem estimativa.

Valores são representados por inteiros BigInt em pico-unidades monetárias (10^-12). Uma tarifa por milhão com até seis casas decimais pode ser multiplicada por tokens inteiros sem perda por ponto flutuante. A UI arredonda apenas para apresentação; o JSON conserva a precisão. Preço zero explícito não prova custo energético zero.

Economia por tarefa exige `baselineRun`, `candidateRun`, identidade compatível, quantidades esperadas, aceitação das duas execuções e hashes de evidências/verificador. O `configurationHash` deve identificar controles comuns, excluindo apenas a intervenção estudada; o manifesto externo deve registrar separadamente as revisões do BBrainX. Não use um hash diferente para esconder uma troca de modelo ou orçamento.

São recusados como comparáveis: run incompleto, modelo/harness/projeto/snapshot incompatível, usage desconhecido, mesma run nos dois braços, ou tarefa não aceita. A diferença é `baseline - candidato`; regressão fica negativa. Divisão por baseline zero gera percentual desconhecido. Pares não são somados numa manchete global porque podem reutilizar recibos e não constituem amostras independentes.

Contagens esperadas e hashes são declarações; o software não demonstra causalidade ou independência do verificador. Uma fatura requer reconciliação externa. Para estimar o efeito causal, use tarefas previamente congeladas, ordem randomizada, múltiplas repetições e critérios de qualidade mantidos por terceiro.

## 4. Durabilidade, privacidade e falhas

O arquivo novo é `usage-v1.sqlite`, no diretório de estado local. O schema e as migrações de `brain.sqlite` permanecem intactos. O novo banco usa WAL, synchronous FULL, timeout de escrita e modo 0600 onde aplicável. Não coloque o banco ativo em pasta sincronizada ou rede. [R04]

A chave da chamada combina projeto, provedor, conta e ID. Uma importação repetida de mesmo fingerprint devolve a revisão existente. Correção exige versão esperada e preserva identidade; a revisão anterior continua no histórico. Todo lote valida antes de escrever e confirma atomicamente. Conflito não vira retry cego nem soma duplicada.

O histórico é versionado, não imutável perante administrador local. Não há assinatura de recibos, attestation de runtime ou auditoria de conformidade. Exportações não contêm campos de prompt/resposta, mas IDs podem revelar nomes particulares; não preencha IDs com segredos e revise antes de publicar. Uma allowlist de campos não é um detector infalível de PII.

A API lê somente após validar o projeto e passa pelos controles existentes de loopback, Host, Origin e Fetch Metadata. Não há importação via HTTP, alteração de endpoint de IA ou leitura de Keychain. Fronteira de confiança: usuário do SO. Não é isolamento entre processos maliciosos do mesmo usuário, autenticação remota ou plataforma multi-tenant.

A leitura de dashboard não cria banco de recibos ausente. Há limites de 100.000 revisões, 1.000 pares por projeto, 5.000 chamadas materializadas, 100 pares exibidos, 100 grupos e 40 grupos monetários. Corte produz indicadores de parcialidade. Pares ficam não comparáveis quando a janela de chamadas é truncada. Quota de retenção falha explicitamente; não apaga histórico silenciosamente para admitir mais dados.

Consulta de contexto limita linhas retornadas, mas a base não tem índice composto `(project, seq)` para eventos: SQLite pode visitar mais linhas que o limite, sobretudo com muitos projetos. Portanto não prometemos O(5.000) de I/O. Materialização agregada/indexação desse caminho é uma melhoria futura que exige migração e evidência próprias. `count(*)` do ledger também trabalha sobre um histórico limitado, não é alegado O(1).

Os dois bancos usam snapshots separados; o relatório não é uma transação de autorização ou cobrança. Ele pode combinar instantes próximos diferentes. A UI não deve governar uma mutação a partir desse relatório.

## 5. Interface e desempenho

O infográfico é HTML/CSS/JavaScript nativo, sem React adicional, CDN, fontes remotas, WebGL, suavização artificial de scroll ou polling. O painel React original permanece separado. Números e barras não precisam disputar a GPU com o modelo. A página só busca dados ao abrir, mudar projeto ou atualizar manualmente.

O desenho tem quatro indicadores, barras de contexto, composição de usage quando todas as parcelas existem, fluxo explicativo de medição, pares aceitos e tabela de origens. Conteúdo do arquivo local usa `textContent`. Importação de relatório é limitada e validada antes de substituir a visão. Exportações são feitas no navegador; a ferramenta não envia o arquivo para serviços externos.

O estado de requisição usa AbortController e geração. A resposta atrasada de um projeto não pode sobrepor o novo. Durante a troca, a visão anterior fica suspensa e a exportação desabilitada. A tela é responsiva, tem controles de teclado e navegação nativa, não faz loops de animação e mantém limite de grupos exibidos.

O compilador otimizado verifica a quota de documentação antes de codificar novamente o prefixo inteiro com o candidato. Guarda a contagem exata do último texto aceito e a reutiliza no resultado. Não soma tokenCounts de fragmentos como se BPE fosse aditivo. Complexidade assintótica permanece a mesma; o benefício pretendido é evitar trabalho repetido em constantes. Não declaramos ganho universal em milissegundos.

## 6. Verificação e publicação

```sh
node scripts/observatory-evidence.mjs
node scripts/observatory-parity.mjs
npm run build
npx playwright install chromium
npx playwright test --config playwright.usage.config.mjs
```

`observatory-parity` compara o payload inteiro com o compilador original no commit base, em corpus sintético, antes de registrar timings exploratórios. Não usa um modelo fictício para medir inferência. `observatory-mutations.mjs` deve rodar somente em checkout isolado e limpo: injeta dupla contagem, perda de idempotência e ausência de referência, exige falha pertinente e restaura arquivos.

Os testes do browser utilizam um servidor real com SQLite e contexto realmente calculado sobre corpus gerado. A visão monetária utiliza recibos **sintéticos** para exercitar as fórmulas; a tela traz esse aviso. São testes de contabilidade, não recibos comerciais nem prova de economia do produto.

`observatory-package.mjs` produz um visualizador HTML offline, sem backend/estado privado, além de código rastreado, patch e evidências. Para visualizar offline, abra esse HTML e um JSON exportado localmente. Não publicar relatórios particulares como assets de site.

O próximo aceite de produto é importar recibos autorizados de duas tarefas reais, com controles iguais e resultados verificados, e repetir em estação MEDIUM com trabalho foreground. Esta rodada não faz essa medição, não carrega Strata/Laya e não aprova 99% de acerto.
