# Contribuir com o BBrainX

Contribuições devem ser pequenas, reproduzíveis e orientadas a evidências. Reduzir complexidade pode ser mais valioso que adicionar um framework.

Comece pelo [ponto de retomada](docs/engineering/CONTINUITY.md), execute `npm run project:status` e escolha um item da [fila com critérios de aceite](docs/engineering/ROADMAP.md). Declare arquivos sob sua responsabilidade ao trabalhar em paralelo. Termine registrando revisão, resultado observado, limites e próxima ação na PR; outra pessoa deve conseguir continuar sem ler seu chat.

## Ambiente

Node 24, Git e `npm run setup`. Para navegador, instale Chromium com Playwright e execute `npm run test:e2e`. Nunca use dados privados, credenciais ou código proprietário nas fixtures.

## Critérios

Explique o problema, alternativa mais simples, reprodução antes/depois, permissões afetadas e testes. Execute `npm test` e `npm run build`. Uma mudança de schema exige migração e teste com banco existente. Não remova uma asserção válida para deixar a CI verde.

Mantenha o serviço de memória sem shell arbitrário. Preserve credenciais e configurações dos harnesses. Não anuncie economia financeira a partir de bytes, fixture sintética ou assinatura convertida artificialmente em API. Diferencie mocks, protocolo real e aplicativos finais.

## Primeiras contribuições úteis

Casos de borda, homologação em clientes reais, exportação portável com schema, busca estrutural/LSP e documentação traduzida. Discuta antes de adicionar bancos ou orquestradores.

## Conduta

Discorde de ideias com evidências e respeite pessoas. Não publique explorações, tokens, bancos pessoais ou transcripts privados em issues. Consulte SECURITY.md.
