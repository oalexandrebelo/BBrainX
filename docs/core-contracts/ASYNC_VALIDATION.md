# Refinamentos assíncronos: uma falha revelada pela primeira CI

A primeira execução desta branch (commit `806f1091`) aprovou 20 de 21 testes focados e falhou no teste de rejeição tardia de um refinamento Zod. A falha não foi ignorada nem convertida em teste pulado.

## Mecanismo

O adaptador Standard Schema de Zod examinado tenta primeiro uma execução síncrona. Ao encontrar um refinamento que retorna Promise, pode abandonar essa tentativa e repetir pelo caminho assíncrono. A primeira promessa já começou; se rejeitar depois, não pertence à promessa retornada à aplicação. O motor só pode observar a cadeia que o validador devolve, não todo trabalho arbitrário iniciado dentro dele.

Fonte de implementação lida: `colinhacks/zod@0b216ef674e297ebe41d8bf902262e56f8755822`, `packages/zod/src/v4/core/schemas.ts`, funções `runChecks`, `standardProps` e `validateAsync`. Isso explica o padrão observado; não é uma alegação de que toda versão Zod tem exatamente o mesmo comportamento. O lockfile e a saída de CI identificam a versão efetivamente testada do BBrainX.

Documentação pública Zod: https://zod.dev/basics — refinamentos/transforms assíncronos devem usar `safeParseAsync`.

## Solução explícita na composição

`src/schema-adapters.mjs` exporta `asyncZodSchema(schema)`. Ele preserva o contrato Standard Schema/JSON Schema, mas invoca a API pública `safeParseAsync` uma vez. Não importa uma nova biblioteca, não usa `_zod`, não altera o objeto recebido e não instala um handler global que suprime rejeições.

```js
import { z } from 'zod';
import { asyncZodSchema } from '../../src/schema-adapters.mjs';

const input = asyncZodSchema(z.object({name:z.string()}).strict());
```

O exemplo usa o adapter num objeto simples; ele também atende ao schema host-owned com refinamentos assíncronos. Os schemas de produção síncronos existentes não precisam trocar seu caminho. Autor da capability é responsável por selecionar o adapter quando inclui comportamento assíncrono de Zod.

O motor continua consumindo Standard Schema e limitando validação, autorização, execução e saída no mesmo deadline. Os testes agora exigem uma única execução do refinamento, rejeição tardia observada, rejeição antecipada com código sanitizado e preservação de issues de validação. Eles não removem a falha original de prazo/isolamento do espaço de teste.

Esse mecanismo não torna callbacks arbitrários preemptíveis, não cancela recursos que ignorem AbortSignal e não garante contenção de código malicioso no mesmo processo. Validação estrutural deve ser determinística; I/O de autorização pertence ao access port controlado, não a um refinamento que modifica estado externo.
