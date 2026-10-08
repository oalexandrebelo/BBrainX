// Implementação Standard Schema real para este domínio delimitado, sem dependências externas.
import { createEngine } from '../../src/capability.mjs';
import { runEngineCli } from '../../src/engine-cli.mjs';
import { pathToFileURL } from 'node:url';
const schema = (field, type) => ({ '~standard': { version: 1, vendor: 'bbrainx-test-domain',
  validate(value) {
    return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 &&
      typeof value[field] === type && (type !== 'string' || value[field].length <= 16000)
      ? { value } : { issues: [{ message: 'Invalid bounded object' }] };
  },
  jsonSchema: Object.fromEntries(['input', 'output'].map(side => [side, () => ({ type: 'object',
    properties: { [field]: { type } }, required: [field], additionalProperties: false })]))
} });
export function textCapability() { return {
  description: 'Contar codepoints do texto informado; não faz inferência nem consulta arquivos.',
  input: schema('text', 'string'), output: schema('length', 'number'), access: 'authenticated', timeoutMs: 1000,
  run: ({ input }) => ({ length: Array.from(input.text).length })
}; }
export const library = { name: 'text-library', version: '1.0.0', capabilities: { 'text.length': textCapability() } };
export const engine = () => createEngine({ name: 'contract-fixture', version: '1.0.0', libraries: [{ library }] });
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  process.exitCode = await runEngineCli(engine(), { argv: process.argv.slice(2), principal: { id: 'fixture-host' } });
