import { ensure } from './primitives.mjs';
import { prepareRoot, openNeed, writeText, writePart, listNeed, readText } from './files.mjs';
import { analyze, analyzeIfDue, listProposals, buildProposal, dismissProposal } from './deliverables.mjs';
import { indexProject } from './retrieval.mjs';

export const FILES_PROJECT = 'projetos';
const int = (value, code) => { if (value === undefined) return undefined; const n = Number(value); ensure(Number.isInteger(n), code); return n; };
/** Busca do projeto `projetos` já encontra o arquivo novo; índice é derivado, falha aqui nunca desfaz a gravação. */
function refresh(store) { try { if (store.projects().some(p => p.id === FILES_PROJECT)) indexProject(store, FILES_PROJECT); } catch { /* a próxima busca reindexa */ } }

/**
 * `bbrainx files root|setup|open|write|list|read|propose|proposals|build|dismiss`, sempre com JSON na saída. É o caminho do
 * AB-S00S (web) e de scripts; o conteúdo de `write` vem pela entrada padrão (sem limite de argumento nem exposição no ps).
 */
export async function filesCommand(store, sub, values, readStdin) {
  const home = store.home, { root, source } = prepareRoot();
  if (sub !== 'propose') { try { analyzeIfDue(root, home); } catch { /* melhor esforço */ } }
  if (sub === 'root') return { root, source, searchProject: store.projects().find(p => p.id === FILES_PROJECT) ? FILES_PROJECT : null };
  if (sub === 'setup') {
    // Um projeto só para a pasta inteira: o registro recusa projetos aninhados, então as necessidades não viram projetos próprios.
    const known = store.projects().find(p => p.id === FILES_PROJECT);
    if (!known) store.register(FILES_PROJECT, root);
    const index = indexProject(store, FILES_PROJECT);
    return { root, source, project: FILES_PROJECT, registered: !known, files: index.files, next: 'bbrainx search --project ' + FILES_PROJECT + ' --query "..."' };
  }
  if (sub === 'open') { ensure(values.name, 'NAME_REQUIRED', 'Use --name "nome curto da necessidade".'); return { root, ...openNeed(root, { name: values.name }) }; }
  if (sub === 'write') {
    ensure(values.need && values.path, 'NEED_AND_PATH_REQUIRED', 'Use --need AAAA-MM-DD-nome --path arquivo.md e o conteúdo pela entrada padrão.');
    const content = await readStdin(), part = int(values.part, 'FILES_PART_INVALID');
    const result = part === undefined ? writeText(root, { need: values.need, path: values.path, content })
      : writePart(root, home, { need: values.need, path: values.path, content, part, uploadId: values['upload-id'], final: values.final === true });
    if (result.absolute) refresh(store);
    return result;
  }
  if (sub === 'list') return listNeed(root, { need: values.need });
  if (sub === 'read') { ensure(values.need && values.path, 'NEED_AND_PATH_REQUIRED'); return readText(root, { need: values.need, path: values.path, start: int(values.start, 'FILES_RANGE_INVALID') ?? 0 }); }
  if (sub === 'propose') return { analysis: analyze(root, home), ...listProposals(home) };
  if (sub === 'proposals') return listProposals(home, { status: values.status ?? 'proposed' });
  if (sub === 'build') { ensure(values.proposal, 'PROPOSAL_REQUIRED', 'Use --proposal ID (de bbrainx files proposals).'); return buildProposal(root, home, { id: values.proposal, formats: values.formats ? values.formats.split(',').map(s => s.trim()) : undefined }); }
  if (sub === 'dismiss') { ensure(values.proposal, 'PROPOSAL_REQUIRED'); return dismissProposal(home, { id: values.proposal }); }
  ensure(false, 'FILES_COMMAND_UNKNOWN', 'Use: files root | setup | open | write | list | read | propose | proposals | build | dismiss');
}
