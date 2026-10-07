# Atualização de links e evidência

Consulta complementar nesta rodada:

- Zod, uso assíncrono: https://zod.dev/basics — recomenda `safeParseAsync` para refinamentos/transforms assíncronos.
- Zod, mecanismo Standard Schema examinado: https://github.com/colinhacks/zod/blob/0b216ef674e297ebe41d8bf902262e56f8755822/packages/zod/src/v4/core/schemas.ts — fallback da sondagem síncrona à validação assíncrona.
- **Correção de S23:** o endereço antigo de integração assíncrona Helicone não respondeu. Usar como evidência o changelog oficial https://www.helicone.ai/changelog/20250226-disabled-logging-async. Ele distingue `disable_logging()` (desliga exportação) de `disable_content_tracing()` (suprime conteúdo, mantém métricas). Esses controles não existem no BBrainX apenas por terem sido documentados aqui. Uma integração futura exige sua própria implementação e testes.

Estes links complementam SOURCES.md; documentos de fontes não representam execução ou aprovação dos produtos citados.
