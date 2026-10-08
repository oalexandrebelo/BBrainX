import { types } from 'node:util';

export class CompositionError extends TypeError {
  constructor(code) { super(code); this.name = 'CompositionError'; this.code = code; }
}
const check = (ok, code) => { if (!ok) throw new CompositionError(code); };
const validId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
/** Descritores pertencem ao host. Não executar getters, proxies ou descoberta de módulos. */
function dataRecord(value) {
  check(value !== null && typeof value === 'object' && !types.isProxy(value), 'INVALID_COMPOSITION_RECORD');
  check([Object.prototype, null].includes(Object.getPrototypeOf(value)), 'INVALID_COMPOSITION_RECORD');
  const entries = Object.getOwnPropertyDescriptors(value);
  check(Reflect.ownKeys(entries).every(key => typeof key === 'string'), 'INVALID_COMPOSITION_RECORD');
  for (const field of Object.values(entries)) check('value' in field, 'ACCESSOR_IN_COMPOSITION');
  return Object.fromEntries(Object.entries(entries).filter(([, d]) => d.enumerable).map(([key, d]) => [key, d.value]));
}

function dataArray(value, maximum) {
  check(Array.isArray(value) && !types.isProxy(value) && value.length <= maximum, 'INVALID_SELECTION');
  const fields = Object.getOwnPropertyDescriptors(value);
  check(Reflect.ownKeys(fields).every(key => key === 'length' || /^(0|[1-9][0-9]*)$/.test(String(key))), 'INVALID_SELECTION');
  return Array.from({ length: value.length }, (_, i) => {
    check(fields[i] && 'value' in fields[i], 'ACCESSOR_IN_COMPOSITION');
    return fields[i].value;
  });
}

/** Bibliotecas explícitas: composição não importa plugins nem concede escopo ao chamador. */
export function composeCapabilityLibraries(selections = [], local = {}) {
  check(Array.isArray(selections) && !types.isProxy(selections) && selections.length <= 64, 'LIBRARY_LIMIT');
  const declarations = [], provenance = [], seenLibraries = new Set();
  const add = (id, capability, origin) => {
    check(validId(id), 'INVALID_CAPABILITY_ID');
    check(declarations.length < 4096, 'CAPABILITY_LIMIT');
    const copy = dataRecord(capability);
    check(typeof copy.run === 'function' && copy.input && copy.output, 'INVALID_CAPABILITY');
    declarations.push([id, Object.freeze(copy)]); provenance.push(Object.freeze({ id, ...origin }));
  };
  for (const [id, capability] of Object.entries(dataRecord(local))) add(id, capability, { source: 'local' });
  for (const selected of dataArray(selections, 64)) {
    const selection = dataRecord(selected);
    check(Object.keys(selection).every(k => ['library', 'include', 'rename'].includes(k)), 'UNKNOWN_SELECTION_FIELD');
    const library = dataRecord(selection.library);
    check(Object.keys(library).every(k => ['name', 'version', 'capabilities'].includes(k)), 'UNKNOWN_LIBRARY_FIELD');
    check(validId(library.name) && typeof library.version === 'string' && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(library.version), 'INVALID_LIBRARY_IDENTITY');
    check(!seenLibraries.has(library.name), 'DUPLICATE_LIBRARY'); seenLibraries.add(library.name);
    const available = dataRecord(library.capabilities), ids = dataArray(selection.include ?? Object.keys(available), 4096);
    check(Array.isArray(ids) && !types.isProxy(ids) && ids.length <= 4096 && ids.every(validId), 'INVALID_SELECTION');
    check(new Set(ids).size === ids.length, 'DUPLICATE_SELECTION');
    const rename = dataRecord(selection.rename ?? {});
    check(Object.keys(rename).every(id => ids.includes(id)) && Object.values(rename).every(validId), 'INVALID_RENAME');
    for (const originalId of ids) {
      check(Object.hasOwn(available, originalId), 'CAPABILITY_NOT_EXPORTED');
      add(rename[originalId] ?? originalId, available[originalId], { source: library.name, version: library.version, originalId });
    }
  }
  const ids = new Set();
  for (const [id] of declarations) { check(!ids.has(id), 'CAPABILITY_COLLISION'); ids.add(id); }
  // Null prototype evita semântica especial de __proto__; ordem de seleção é deliberada.
  const capabilities = Object.assign(Object.create(null), Object.fromEntries(declarations));
  return Object.freeze({ capabilities: Object.freeze(capabilities), provenance: Object.freeze(provenance) });
}
