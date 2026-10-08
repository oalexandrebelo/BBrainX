# Rodada 3 — oportunidades de OpenCode/GitHub e BrainX, sem acoplamento de produto

## 1. Escopo confirmado

OpenCode é referência de engenharia nesta rodada, não harness embutido. Não foi executado seu instalador, criado GitHub App, ativado compartilhamento de sessões, configurado provider ou adicionado segredo. `chaobrain/brainx` é ecossistema de simulação cerebral, não um concorrente de memória MCP por coincidência de nome. Não importamos JAX ou pacotes de simulação no BBrainX.

## 2. O que observar no OpenCode

A documentação consultada em 08/10/2026 expõe automação a partir de comentários, issues, revisões, schedules e acionamento manual. Mantém contexto de arquivo/linhas/diff em comentários de revisão, pode criar branches/PRs e permite token fornecido pelo chamador em alternativa ao fluxo OIDC do App. A configuração `share` documenta default verdadeiro para repositório público. Os exemplos usam action em `@latest` e checkout sem credenciais persistidas. Fonte: https://opencode.ai/docs/github/.

Esses são fatos da documentação, não uma homologação do runner ou de todas as permissões internas do produto. O BBrainX não precisa desse software instalado para aproveitar seus limites de ação, eventos e evidência.

### Técnica A — contexto de revisão vinculado ao snapshot

Uma instrução sobre “linha 42” perde referência depois de novos commits. Nosso desenho de execução exige repositório, commit/head alvo, base, paths e preimage. Comentário e patch são dados, não autorização. A validação final recebe identidade esperada do host para recusar um relatório válido que pertence a outro commit. Ação genérica de revisão não recebe permissão de publicar só porque viu uma menção a seu nome.

Não fizemos um agente automático de comentários. A implementação transferida é o contrato de recibo e sua utilização no coletor da CI. O mecanismo permite que qualquer harness produza a mudança e qualquer runner gere a evidência, mantendo separação entre proposta, execução e promoção.

### Técnica B — separar privilégio de analisar, executar e publicar

Proposta: job de análise sem credenciais de produção; teste em checkout efêmero; publicador com permissão específica e revisão do head antes da escrita. Não executar scripts da branch de terceiro dentro de `pull_request_target` com segredos. O publicador não importa código do artefato que ele está julgando; trata o pacote como dados. Assinatura/atestado devem vir de uma fronteira confiável independente, não de uma chave dentro do processo do agente.

GitHub recomenda privilégio mínimo e mitigação explícita de script injection; destaca riscos de conteúdo não confiável em workflows privilegiados. Nossa CI dedicada é `contents:read`, sem instalação de App e sem keys de modelos. Referência: https://docs.github.com/en/actions/reference/security/secure-use.

Uma expressão de comentário interpolada em shell não equivale a um argumento corretamente tratado. Nem todo ataque é injeção de shell: o próprio conteúdo pode instruir o agente a vazar dados. O domínio resolve permissões fora da interpretação probabilística; logs/artefatos de builds de terceiros continuam não confiáveis para o publicador.

### Técnica C — retomada por evento e idempotência, não replay de efeitos

O identificador de operação deve sobreviver ao retry e o de tentativa deve mudar. Se uma publicação foi enviada e a confirmação sumiu, o estado é desconhecido até reconciliação. Um handler repetido não deve abrir PRs duplicados nem marcar uma tarefa aprovada por cache de texto. O gatilho define o contexto de execução, mas não prova seu resultado.

Aplicação futura ao BBrainX: uma capability de preparação de handoff poderia devolver requisitos, evidências e próxima etapa sem alterar GitHub. Uma capability separada de publicação exige principal, head esperado e confirmação adequada. Essa divisão é mais reutilizável que embutir o comando `/opencode` como protocolo próprio do BBrainX.

### Técnica D — custo e retenção explícitos

A instrução `share` não pode virar um opt-in implícito por o repositório ser público: uma sessão pode conter informação privada que nunca deveria estar naquele repositório. Recomendação BBrainX: compartilhamento desligado por padrão, seleção metadata-only e revisão dos artefatos a publicar. Não mudamos as configurações OpenCode do usuário; essa é a política proposta para nossas próprias superfícies.

## 3. BrainX: lições que realmente se transferem

Revisão fixada: `caac2e9d85025a15e55cb75bd99ee7306751945e`. Foram lidos `requirements.txt`, `pyproject.toml`, `BrainX/compatibility_test.py`, `BrainX/version_test.py`, `_packaging/calver_backend.py` e workflows. A suite do BrainX não foi executada; a dependência de simulação não faz parte desta PR.

O ecossistema fixa versões dos seus componentes e delimita o intervalo JAX. Seus testes combinam componentes, confrontam operadores esparsos com referência densa e verificam unidades e valores conhecidos. A CI possui matriz entre sistemas e uma trilha de versões JAX. O backend congela a versão de um sdist, mas a criação a partir de source e o fallback de checkout podem usar a data corrente. Esses mecanismos exigem atenção à identidade efetivamente executada, não apenas ao nome da release.

### Composição testada contra um resultado independente

O aprendizado para o BBrainX é testar a combinação, não somar suites de bibliotecas isoladas. Adotamos Direct/CLI/MCP com a mesma capacidade; duas lanes com a mesma memória; worker com transportes reais; e um recibo que especifica commit, tree, dependências, comando e ambiente. O oráculo de uma otimização deve ser simples e independente: no limitador da rodada 4, será uma implementação de referência sem ring.

Uma falha em transformação de gradiente pode deixar importações funcionando. Analogamente, um MCP que responde a `tools/list` pode continuar falhando em cancelamento, autorização ou retomada. Smoke test, teste funcional e teste de falha são provas diferentes. Não usar um único “healthy” para substituí-las.

### Versão do pacote não basta

Proposta concreta adotada no recibo: `revision`, `tree`, `lockDigest`, `commandDigest`, `suite`, runtime, arquitetura e plataforma. A evolução não muda silenciosamente o número 0.4.0 do produto apenas para produzir um selo maior. A medição identifica o commit de código. Um future release builder pode também fixar SOURCE_DATE_EPOCH e gerar provenance; isso não foi instalado nesta rodada.

### Unidades e física da medição

O princípio de testes dimensionais transfere diretamente: distinguir ms de s, bytes de MiB, tokens de entrada de tokens reutilizados e tempo de lançamento assíncrono de tempo de conclusão. A documentação JAX recomenda separar compilação, transferência e execução e aguardar o resultado efetivo (por exemplo `block_until_ready`) ao cronometrar computação assíncrona. Fonte: https://docs.jax.dev/en/latest/benchmarking.html.

Não importamos medições de brain simulation como speedup de Laya. Um kernel de neurociência, uma busca FTS e uma inferência de linguagem têm operações e limites diferentes. O que se transfere é metodologia de composição e de referência, não um multiplicador de velocidade.

## 4. Contrato executável de evidência

`evaluateEvidence(receipt, expected)` aceita apenas um envelope JSON versionado e um conjunto esperado fornecido pelo host. Confronta repositório, revisão, tree, lock, suite, digest de comando e ambiente. Verifica conclusão, exit 0, ausência de sinal, contagens inteiras não vazias, nenhum skip/cancelamento/TODO/falha e o mínimo explícito de casos. Rejeita nomes de artefato duplicados ou com caminhos e alterações entre os hashes de source anterior e posterior.

O contrato não faz inferência, não abre rede e não escreve no ledger de memórias. Uma resposta aceita contém `producerAuthenticated:false`, `artifactBytesVerified:false` e `taskCorrectnessCertified:false`. Esses campos impedem a confusão entre coerência do relato e autenticidade de quem relata. O SHA-256 do recibo é integridade identificável, não assinatura de confiança.

`four-rounds-evidence.mjs` coleta dados de uma execução real do Node test runner no checkout da CI. Inspeciona fonte rastreada antes/depois, escreve logs, recibo e relatório, e chama o gate. A política de versão mínima é declarada; nenhum teste silenciosamente omitido por falta de dependência conta como sucesso. O próprio runner ainda precisa ser confiável: um candidato que pode alterar os testes e o gate pode se autoaprovar. A proteção do workflow/branch e um verificador independente permanecem requisitos de promoção pública.

O scan antes/depois não é transação do filesystem. Uma alteração intermediária revertida pode não aparecer nesses dois pontos. Para garantir imutabilidade da fonte durante teste, é preciso ambiente com montagem/identidade adequadas e build separado; não alegamos que hashing resolva isso sozinho.

## 5. O que foi implementado e o que permanece proposta

Implementado: contrato de recibo, 19 testes novos de identidade/contagens/falhas, coletor usado na CI e documentação de fronteiras. Nenhum pacote npm novo. Não implementado: executor autônomo no GitHub, assinatura de releases, OIDC próprio, secret broker ou workflow genérico que aceita comandos livres de comentários. Nenhuma promessa de compliance ou sandbox deriva deste código.

O critério para uma integração OpenCode futura permanece o definido pelo usuário: benefício concreto. Como o BBrainX atende Direct, CLI e MCP, ele pode ser consumido por um harness compatível sem incorporá-lo. A PR extrai oportunidades e mantém essa independência.

Fontes adicionais fixadas: https://github.com/chaobrain/brainx/tree/caac2e9d85025a15e55cb75bd99ee7306751945e e os caminhos listados acima. Nenhum logo, peso ou fonte tipográfica foi copiado.
