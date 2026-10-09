// Compilado com tsc --noEmit; nunca executado como teste de runtime.
import { SharedAdmission, type Acquisition, type Reservation } from '../../src/shared-admission.mjs';
const ledger = new SharedAdmission('/host-controlled', { reconcileVerifier: (_, proof) => proof.kind === 'owned-process-closed' });
const result: Acquisition = ledger.acquire({ resource: 'neural', scopeDigest: 'hash', requestDigest: 'hash', bytes: 1 });
if (result.ok) {
  const row: Reservation = ledger.release(result.handle, { expectedRevision: 1, evidenceDigest: 'hash' });
  const state: 'running' | 'unknown' | 'released' = row.state;
  void state;
} else { const reason: string = result.reason; void reason; }
// @ts-expect-error A verificação do host é síncrona: Promise não é autorização.
new SharedAdmission('/host-controlled', { reconcileVerifier: async () => true });
// @ts-expect-error Byte budget não aceita string.
ledger.acquire({ resource: 'neural', scopeDigest: 'hash', requestDigest: 'hash', bytes: '1' });
// @ts-expect-error O token não faz parte da inspeção pública.
ledger.inspect().reservations[0].token;
// @ts-expect-error TTL não é mecanismo de liberação.
ledger.release({}, { expectedRevision: 1, ttlMs: 5 });
