import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { indexProject } from './retrieval.mjs';
import { ensure } from './primitives.mjs';

/** Separate CLI process: reconcile the registered worktree, including new files
 * and ignore changes. No repository hooks, shell, network or harness mutation.
 * Delay starts after each completed scan; cycles never overlap in this process.
 * Failure exits visibly. A supervisor may restart; we never report stale success.
 */
export async function watchIndex(store, project, { intervalMs=30000, signal, onCycle=()=>{} }={}) {
  ensure(Number.isSafeInteger(intervalMs)&&intervalMs>=1000&&intervalMs<=3600000,
    'INVALID_INTERVAL','--interval must be 1000..3600000 milliseconds.');
  let cycle=0;
  while(!signal?.aborted){
    const started=performance.now();
    store.beginOperation?.();
    try {
      const result=indexProject(store,project);
      onCycle({service:'AB-BBX',cycle:++cycle,project,root:store.project(project).root,
        lane:store.binding?.id??null,observedAt:new Date().toISOString(),
        durationMs:Math.round(performance.now()-started),intervalMs,
        snapshot:result.snapshot,files:result.files,changed:result.changed,
        removed:result.removed,skippedByReason:result.skippedByReason,
        consistency:'periodic-worktree-reconciliation'});
    } finally { store.endOperation?.(); }
    try { await delay(intervalMs,undefined,{signal}); }
    catch(error){if(error.name==='AbortError'&&signal?.aborted)return;throw error;}
  }
}
