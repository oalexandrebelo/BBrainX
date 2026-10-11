// Checkpoints one lane in a tight loop until the lane is closed under it. Usage: lane-checkpoint-loop.mjs <home> <lane>
import { LaneStore } from '../../src/lanes/store.mjs';
import { indexProject } from '../../src/retrieval.mjs';
const [home, lane] = process.argv.slice(2);
const store = new LaneStore(home, 'product', lane);
let acked = 0, stop = null, busy = 0;
try {
  store.beginOperation(); indexProject(store, 'product');
  process.send({ ready: true });
  const until = Date.now() + 8000;
  for (let i = 0; Date.now() < until && !stop; i++) {
    try {
      store.checkpoint('product', 'LOOP', { objective: 'o' + i, nextAction: 'n', status: 'in_progress' }, acked, 'loop-' + i);
      acked++;
    } catch (e) { if (e.errcode === 5) busy++; else stop = e.code ?? String(e.message); }
  }
  process.send({ done: true, acked, busy, stop });
} finally { store.close(); }
