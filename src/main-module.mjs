import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * true quando `metaUrl` (import.meta.url) é o módulo principal do processo. Node resolve symlinks do módulo principal, mas
 * process.argv[1] mantém o caminho como foi digitado: iniciado por `app/current/...` (symlink para `releases/<sha>`), a
 * comparação textual falha e o script sairia com exit 0 sem fazer nada. Compara os dois por realpath; nunca lança.
 */
export function isMainModule(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try { return fs.realpathSync.native(argv1) === fs.realpathSync.native(fileURLToPath(metaUrl)); } catch { return false; }
}
