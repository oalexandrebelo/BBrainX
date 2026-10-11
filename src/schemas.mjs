import { z } from 'zod';
/**
 * Pedaços de esquema compartilhados pelas ferramentas MCP. O texto de cada um aparece em tools/list, em todo turno do harness:
 * por isso a regex do identificador fica só na validação (refine), em vez de repetida como `pattern` em cada propriedade,
 * e `data` é um objeto JSON (toda capacidade devolve objeto) em vez do esquema recursivo de z.json(), idêntico nas ferramentas.
 */
export const id=z.string().min(1).max(80).refine(value=>/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value),'Use letters, digits, . _ - and start with a letter or digit.');
export const output=z.object({ok:z.boolean(),data:z.record(z.string(),z.unknown()).nullable(),error:z.string().nullable(),detail:z.string().nullable()}).strict();
