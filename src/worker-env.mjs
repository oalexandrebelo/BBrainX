/** Retain only runtime paths, never provider credentials, PYTHONPATH or Node injection flags.
 * Offline library flags are not an OS network sandbox. Single source of the worker environment policy:
 * every path that spawns a Laya worker (LayaBroker, JsonLineWorker/LayaTransport, version probes) uses it.
 */
const RETAINED=Object.freeze(['PATH','HOME','USERPROFILE','SYSTEMROOT','SystemRoot','WINDIR','TEMP','TMP','TMPDIR','LANG','LC_ALL']);
export function workerEnv(source=process.env){
  const env={};
  for(const name of RETAINED)if(source[name]!==undefined)env[name]=source[name];
  return {...env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1',TOKENIZERS_PARALLELISM:'false',PYTHONNOUSERSITE:'1'};
}
