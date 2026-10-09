// Cliente Laya com transporte de teste real. Mede coordenação, nunca acurácia de modelo.
import { SharedLayaBroker } from '../../src/shared-laya-broker.mjs';
import { fileURLToPath } from 'node:url';
const [home, scope = 'b'] = process.argv.slice(2);
const broker = new SharedLayaBroker({ home, resource: 'neural', scopeDigest: scope.repeat(64), reserveBytes: 20,
  command: [process.execPath, fileURLToPath(new URL('./serial-worker.mjs', import.meta.url)), 'normal'], startMs: 10000, deadlineMs: 3000 });
process.send({ event: 'ready' });
process.on('message', async message => {
  try {
    if (message.command === 'decide') {
      const result = await broker.decide(['coordination-contract'], { q: { type: 'noul', instructions: 'transport' } });
      process.send({ event: 'decided', result, stats: broker.stats() });
    } else if (message.command === 'stop') process.send({ event: 'stopped', result: await broker.stop() });
    else if (message.command === 'close') { await broker.close(); process.send({ event: 'closed' }); process.disconnect(); }
  } catch (e) { process.send({ event: 'error', code: e.code ?? e.message }); }
});
process.on('disconnect', () => { void broker.close().catch(() => { process.exitCode = 1; }); });
