// Opens a fresh store/registry at a wall-clock barrier so many processes hit a brand-new database at once.
// Usage: cold-open.mjs <brain|registry> <home> <epochMsBarrier>. Prints one JSON line.
import { BrainStore } from '../../src/store.mjs';
import { LaneRegistry } from '../../src/lanes/registry.mjs';
const [kind, home, barrier] = process.argv.slice(2);
while (Date.now() < Number(barrier)) { /* spin: all children leave together */ }
try {
  const opened = kind === 'registry' ? new LaneRegistry(home) : new BrainStore(home);
  opened.close();
  process.stdout.write(JSON.stringify({ ok: true }) + '\n');
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, code: e.code ?? null, errcode: e.errcode ?? null, message: String(e.message).slice(0, 120) }) + '\n');
}
