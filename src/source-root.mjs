import fs from 'node:fs';
import { ensure } from './primitives.mjs';

/** A raiz foi canonicalizada no registro. Recusar substituição persistente da raiz ou de seus ancestrais. */
export function verifyRoot(root) {
  let actual,stat;
  try{actual=fs.realpathSync(root);stat=fs.lstatSync(root);}
  catch{ensure(false,'PROJECT_ROOT_CHANGED','A raiz registrada não está disponível; confira o diretório autorizado.');}
  ensure(stat.isDirectory()&&!stat.isSymbolicLink()&&actual===root,'PROJECT_ROOT_CHANGED','A raiz registrada mudou de destino; confira o diretório autorizado.');
}
