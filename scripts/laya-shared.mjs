import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { stateHome } from '../src/host.mjs';
import { BrainStore } from '../src/store.mjs';
import { LaneRegistry } from '../src/lanes/registry.mjs';
import { layaStatus } from '../src/laya.mjs';
import { SharedLayaBroker } from '../src/shared-laya-broker.mjs';

let broker;
try {
  const { values, positionals, tokens } = parseArgs({ tokens: true, options: {
    project: { type: 'string' }, lane: { type: 'string' }, resource: { type: 'string' }, file: { type: 'string' },
    'reserve-bytes': { type: 'string' }, help: { type: 'boolean' }
  } });
  const names = tokens.filter(t => t.kind === 'option').map(t => t.name);
  if (positionals.length || new Set(names).size !== names.length) throw new Error('INVALID_SHARED_LAYA_ARGUMENTS');
  if (values.help) console.log(`Laya instalado, com admissão compartilhada explícita:
node scripts/laya-shared.mjs --project ID [--lane ID] --resource ID --reserve-bytes N --file request.json

JSON: {"states":["texto"],"questions":{"q":{"type":"noul","instructions":"Questão"}},"maxLen":1024}
Registre o recurso antes usando scripts/admission.mjs. A mesma estação deve usar o mesmo BBRAINX_HOME.
Não instala modelos, não altera harnesses, não aprova memória e não executa ações sugeridas pelo modelo.`);
  else {
    const home = stateHome(), bytes = Number(values['reserve-bytes']);
    if (!values.project || !values.resource || !values.file || !Number.isSafeInteger(bytes) || bytes < 1) throw new Error('INVALID_SHARED_LAYA_ARGUMENTS');
    if (!layaStatus(home).installed) throw new Error('LAYA_NOT_INSTALLED');
    const stat = fs.lstatSync(values.file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1048576) throw new Error('INVALID_LAYA_INPUT_FILE');
    const fd = fs.openSync(values.file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    let raw;
    try {
      const check = fs.fstatSync(fd);
      if (!check.isFile() || check.size > 1048576) throw new Error('INVALID_LAYA_INPUT_FILE');
      raw = Buffer.alloc(1048577); let used = 0, n;
      while (used < raw.length && (n = fs.readSync(fd, raw, used, raw.length - used, null)) > 0) used += n;
      if (used > 1048576) throw new Error('LAYA_INPUT_LIMIT'); raw = raw.subarray(0, used);
    } finally { fs.closeSync(fd); }
    const request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    if (!request || Object.keys(request).some(k => !['states', 'questions', 'maxLen'].includes(k))) throw new Error('INVALID_LAYA_INPUT');
    const authority = new BrainStore(home); let scope;
    try {
      const project = authority.project(values.project);
      scope = { project: values.project, root: project.root };
      if (values.lane) {
        const registry = new LaneRegistry(home);
        try { const lane = registry.verifyBinding(values.project, values.lane); scope = { ...scope, lane: lane.id, epoch: lane.epoch, root: lane.root }; }
        finally { registry.close(); }
      }
    } finally { authority.close(); }
    broker = new SharedLayaBroker({ home, resource: values.resource, reserveBytes: bytes,
      scopeDigest: createHash('sha256').update(JSON.stringify(scope)).digest('hex'), deadlineMs: 120000 });
    const result = await broker.decide(request.states, request.questions, request.maxLen === undefined ? {} : { maxLen: request.maxLen });
    const runtime = broker.info, cleanup = await broker.close();
    console.log(JSON.stringify({ ...result, runtime, cleanup, modelDecisionIsAuthorization: false }, null, 2));
    if (!result.ok || !cleanup.released) process.exitCode = 1;
  }
} catch (e) {
  const known = new Set(['INVALID_SHARED_LAYA_ARGUMENTS', 'LAYA_NOT_INSTALLED', 'INVALID_LAYA_INPUT_FILE', 'LAYA_INPUT_LIMIT', 'INVALID_LAYA_INPUT']);
  console.error(JSON.stringify({ error: e.code ?? (known.has(e.message) ? e.message : 'SHARED_LAYA_FAILED') })); process.exitCode = 1;
} finally { if (broker) await broker.close(); }
