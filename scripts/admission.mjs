import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { stateHome } from '../src/host.mjs';
import { SharedAdmission, ADMISSION_FILE } from '../src/shared-admission.mjs';

let ledger;
try {
  const { values, positionals, tokens } = parseArgs({ tokens: true, allowPositionals: true, options: {
    home: { type: 'string' }, resource: { type: 'string' }, 'physical-key': { type: 'string' }, slots: { type: 'string' }, bytes: { type: 'string' },
    generation: { type: 'string' }, revision: { type: 'string' }, evidence: { type: 'string' }, 'ledger-id': { type: 'string' },
    'history-limit': { type: 'string' }, 'confirm-resource-stopped': { type: 'boolean' }, help: { type: 'boolean' }
  } });
  const names = tokens.filter(t => t.kind === 'option').map(t => t.name);
  if (new Set(names).size !== names.length) throw new Error('DUPLICATE_ADMISSION_OPTION');
  const action = positionals[0], home = values.home ? path.resolve(values.home) : stateHome();
  const historyLimit = values['history-limit'] ? Number(values['history-limit']) : 100000;
  if (values.help || !action) console.log(`BBrainX — admissão compartilhada, opcional
status [--home DIR]
register --resource ID --physical-key SHA256 --slots N --bytes N [--home DIR]
reconcile --ledger-id UUID --generation N --revision N --evidence SHA256 --confirm-resource-stopped [--home DIR]

Reconcile registra declaração explícita do operador. Não mata processos nem verifica um PID/porta.
Não fornecer --confirm-resource-stopped antes de comprovar que o recurso terminou.
Nenhum token de ownership é impresso. --history-limit precisa ser o configurado no banco.`);
  else {
    if (positionals.length !== 1 || !['status', 'register', 'reconcile'].includes(action)) throw new Error('INVALID_ADMISSION_COMMAND');
    const allowed = { status: ['home', 'history-limit'], register: ['home', 'history-limit', 'resource', 'physical-key', 'slots', 'bytes'],
      reconcile: ['home', 'history-limit', 'ledger-id', 'generation', 'revision', 'evidence', 'confirm-resource-stopped'] }[action];
    if (Object.keys(values).some(k => !allowed.includes(k))) throw new Error('UNUSED_ADMISSION_OPTION');
    if (action === 'status' && !fs.existsSync(path.join(home, 'admission', ADMISSION_FILE))) console.log(JSON.stringify({ installed: false, counters: null }));
    else {
      if (action === 'reconcile' && !values['confirm-resource-stopped']) throw new Error('EXPLICIT_OPERATOR_CONFIRMATION_REQUIRED');
      ledger = new SharedAdmission(home, { historyLimit, readOnly: action === 'status',
        ...(action === 'reconcile' ? { reconcileVerifier: (_, proof) => proof.kind === 'operator-confirmed-quiescence' && values['confirm-resource-stopped'] === true } : {}) });
      const result = action === 'status' ? ledger.inspect() : action === 'register' ? ledger.registerResource({ id: values.resource,
        physicalKey: values['physical-key'], slots: Number(values.slots), byteLimit: Number(values.bytes) }) : ledger.reconcile({
          ledgerId: values['ledger-id'], generation: Number(values.generation), expectedRevision: Number(values.revision),
          evidenceDigest: values.evidence, kind: 'operator-confirmed-quiescence' });
      console.log(JSON.stringify({ ...result, ...(action === 'reconcile' ? { evidenceKind: 'operator-attestation', automaticProcessVerification: false } : {}) }, null, 2));
    }
  }
} catch (e) { console.error(JSON.stringify({ error: e.code ?? 'ADMISSION_CLI_FAILED' })); process.exitCode = 1; }
finally { ledger?.close(); }
