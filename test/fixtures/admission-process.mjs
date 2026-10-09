// Cliente real do ledger. IPC controla interleavings; não simula inferência ou desempenho neural.
import { SharedAdmission } from '../../src/shared-admission.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
const [home, mode = 'hold', workerName = 'client'] = process.argv.slice(2);
const h = text => createHash('sha256').update(text).digest('hex');
let ledger, raw, reservation;
const send = body => process.send(body);
try {
  ledger = new SharedAdmission(home, { busyTimeoutMs: 5000 });
  send({ event: 'ready', workerName });
  process.on('message', message => {
    try {
      if (message.command === 'acquire') {
        reservation = ledger.acquire({ resource: 'neural', bytes: message.bytes ?? 20, scopeDigest: h(workerName), requestDigest: h('request:' + workerName) });
        send({ event: 'acquired', workerName, result: reservation, observed: ledger.inspect().resources[0] });
      } else if (message.command === 'release') {
        const result = ledger.release(reservation.handle, { expectedRevision: 1, evidenceDigest: h('known-completion:' + workerName) });
        send({ event: 'released', workerName, result });
      } else if (message.command === 'begin-uncommitted') {
        raw = new DatabaseSync(ledger.location); raw.exec('BEGIN IMMEDIATE');
        raw.prepare('UPDATE admission_resources SET held_slots=held_slots+1,held_bytes=held_bytes+1 WHERE id=?').run('neural');
        // Banco real com transação aberta: a morte anterior ao COMMIT deve reverter a escrita.
        send({ event: 'uncommitted', workerName });
      } else if (message.command === 'cycle') {
        let accepted = 0, refused = 0, maximum = 0;
        for (let i = 0; i < message.count; i++) {
          const result = ledger.acquire({ resource: 'neural', bytes: 1, scopeDigest: h(workerName), requestDigest: h(workerName + ':' + i) });
          if (!result.ok) { refused++; continue; }
          accepted++; maximum = Math.max(maximum, ledger.inspect().resources[0].heldSlots);
          ledger.release(result.handle, { expectedRevision: 1, evidenceDigest: h('done:' + workerName + ':' + i) });
        }
        send({ event: 'cycled', workerName, accepted, refused, maximum });
      } else if (message.command === 'close') {
        ledger.close(); send({ event: 'closed', workerName }); process.disconnect();
      } else throw new Error('UNKNOWN_FIXTURE_COMMAND');
    } catch (e) { send({ event: 'error', code: e.code ?? e.message, workerName }); }
  });
  process.on('disconnect', () => { raw?.close(); ledger.close(); });
} catch (e) { send({ event: 'error', code: e.code ?? e.message, workerName }); process.exitCode = 1; process.disconnect(); }
