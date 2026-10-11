import { performance } from 'node:perf_hooks';
import { randomInt } from 'node:crypto';

const sleeper = new Int32Array(new SharedArrayBuffer(4));
/** SQLITE_BUSY (5) or SQLITE_LOCKED (6), including extended result codes. */
export const isSqliteBusy = error => Number.isInteger(error?.errcode) && [5, 6].includes(error.errcode & 255);
const busy = isSqliteBusy;

/** Somente inicialização idempotente de journal. Nunca envolver mutações de domínio neste retry.
 * O construtor continua síncrono: a espera bloqueia esta thread, limitada entre chamadas SQLite.
 * Deadline não preempta syscall/kernel. Fonte: contrato SQLite de busy handler e journal_mode.
 */
export function ensureWalMode(db, timeoutMs) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000 || db.isTransaction)
    throw new TypeError('INVALID_WAL_INITIALIZATION');
  const before = db.prepare('PRAGMA busy_timeout').get().timeout;
  const deadline = performance.now() + timeoutMs;
  let failure, attempts = 0;
  db.exec('PRAGMA busy_timeout=0');
  try {
    for (;;) {
      attempts++;
      try {
        // Caminho quente não repete uma comutação de modo já concluída por outro processo.
        const current = db.prepare('PRAGMA journal_mode').get().journal_mode;
        const mode = current === 'wal' ? current : db.prepare('PRAGMA journal_mode=WAL').get().journal_mode;
        if (mode !== 'wal') {
          const error = new Error('ADMISSION_WAL_REQUIRED'); error.code = 'ADMISSION_WAL_REQUIRED'; throw error;
        }
        return { attempts, mode };
      } catch (error) {
        if (!busy(error)) throw error;
        const remaining = deadline - performance.now();
        if (remaining <= 0) {
          const exhausted = new Error('ADMISSION_BUSY', { cause: error });
          exhausted.name = 'AdmissionError'; exhausted.code = 'ADMISSION_BUSY'; throw exhausted;
        }
        // Jitter somente no bootstrap; não roda handlers, não duplica effects e não altera identidade.
        const cap = Math.min(25, 2 ** Math.min(attempts, 5));
        Atomics.wait(sleeper, 0, 0, Math.min(remaining, randomInt(1, cap + 1)));
      }
    }
  } catch (error) { failure = error; throw error; }
  finally {
    try { db.exec('PRAGMA busy_timeout=' + before); }
    catch (cleanup) { if (!failure) throw cleanup; }
  }
}

/** Preserve a exceção no chamador. SQLITE_FULL pode ter encerrado a transação sozinho.
 * Cleanup que falha retira a conexão do serviço; nunca repete a operação de domínio.
 */
export function rollbackAfterFailure(store) {
  try { if (store.db.isTransaction) store.db.exec('ROLLBACK'); }
  catch {
    try { store.close(); } catch { /* a falha secundária não substitui a original */ }
  }
}
