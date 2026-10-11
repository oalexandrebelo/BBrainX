// A lane process whose write has to wait for its lane database. Usage: lane-blocked-writer.mjs <home> <lane> <checkpoint|context>
// Protocol: sends {ready}, waits for {go}, sends {phase:'calling'} right before the write, then {done,...}.
import { LaneStore } from '../../src/lanes/store.mjs';
const [home, lane, op] = process.argv.slice(2);
const store = new LaneStore(home, 'product', lane);
process.send({ ready: true });
await new Promise(resolve => process.once('message', resolve));
try {
  store.beginOperation();
  process.send({ phase: 'calling' });
  const began = performance.now();
  try {
    if (op === 'checkpoint') store.checkpoint('product', 'WAITING', { objective: 'waiting', nextAction: 'n', status: 'in_progress' }, 0, 'waiting-key');
    else { store.approvedMemoryCount('product'); store.commitContextEvent('product', { packId: 'waiting-pack', payloadTokens: 1, sourceCount: 0 }); }
    process.send({ done: true, ok: true, ms: Math.round(performance.now() - began) });
  } catch (e) { process.send({ done: true, ok: false, code: e.code ?? null, errcode: e.errcode ?? null, ms: Math.round(performance.now() - began) }); }
} finally { store.close(); process.exit(0); }
