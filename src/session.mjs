import { indexProject } from './retrieval.mjs';
import { normalizeCheckpoint } from './store.mjs';

/**
 * Checkpoint atestado: sem `snapshot` declarado, o índice é reconciliado com a worktree antes de gravar,
 * de modo que o snapshot carimbado pelo host descreve os arquivos como estão agora. Com `snapshot`
 * declarado vale o contrato estrito da 0.2: precisa ser igual ao do índice atual.
 * A validação e a consulta de idempotência vêm antes: conteúdo inválido ou chamada repetida não reindexam.
 */
export function saveCheckpoint(store,{project,task,content,expectedVersion,idempotencyKey}){
  const declared=normalizeCheckpoint(content);
  if(declared.snapshot===undefined&&!store.hasCheckpointKey(project,idempotencyKey))indexProject(store,project);
  return store.checkpoint(project,task,content,expectedVersion,idempotencyKey);
}
