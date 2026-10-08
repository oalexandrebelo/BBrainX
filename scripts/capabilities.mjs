import { parseArgs } from 'node:util';
import { BrainStore } from '../src/store.mjs';
import { stateHome } from '../src/host.mjs';
import { makeEngine } from '../src/engine.mjs';
import { runEngineCli } from '../src/engine-cli.mjs';
import { LaneStore, bindLaneEngine } from '../src/lanes/store.mjs';

let store;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    project: { type: 'string' }, lane: { type: 'string' }, stdin: { type: 'boolean' }, help: { type: 'boolean' }
  } });
  if (values.help) console.log('node scripts/capabilities.mjs --project ID [--lane ID] list|describe ID|run ID --stdin');
  else {
    if (!values.project) throw new Error('PROJECT_REQUIRED');
    store = values.lane ? new LaneStore(stateHome(), values.project, values.lane) : new BrainStore(stateHome());
    store.project(values.project);
    const engine = makeEngine(store, [values.project]);
    process.exitCode = await runEngineCli(values.lane ? bindLaneEngine(engine, store) : engine, {
      argv: [...positionals, ...(values.stdin ? ['--stdin'] : [])], principal: { id: 'local-cli-host' },
      isFailure: value => value?.ok === false
    });
  }
} catch { console.error('CAPABILITY_CLI_FAILED'); process.exitCode = 1; }
finally { store?.close(); }
