import { performance } from 'node:perf_hooks';
import { JsonLineWorker } from './json-line-worker.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => value === null || (Number.isSafeInteger(value) && value >= 0);
const probability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** Verifica o envelope de transporte; não calibra o modelo nem aprova suas escolhas. */
export function validLayaReply(message, request) {
  if (message?.ok === false) return true; // Falha reportada é devolvida sem detalhe sensível.
  if (message?.ok !== true || !finite(message.ms) || message.ms < 0 ||
      !Array.isArray(message.results) || message.results.length !== request.states.length) return false;
  const names = Object.keys(request.questions);
  return message.results.every(row => {
    if (!object(row) || !object(row.answers) || Object.keys(row.answers).length !== names.length ||
        (row.truncated !== null && typeof row.truncated !== 'boolean') || !count(row.inputTokens) || !count(row.stateTokensDropped) ||
        (row.truncated === false && row.stateTokensDropped > 0)) return false;
    return names.every(name => {
      if (!Object.hasOwn(row.answers, name)) return false;
      const answer = row.answers[name], question = request.questions[name];
      if (!object(answer)) return false;
      if (['confidence', 'answer_confidence', 'noul'].some(k => answer[k] !== undefined && !probability(answer[k]))) return false;
      if (answer.score !== undefined && !finite(answer.score)) return false;
      if (question.type === 'noul' && !probability(answer.noul)) return false;
      if (question.type === 'choice') {
        if (!object(question.criteria) || !Object.hasOwn(question.criteria, answer.choice) || !object(answer.probabilities)) return false;
        const labels = Object.keys(question.criteria), probs = answer.probabilities;
        if (Object.keys(probs).length !== labels.length || !labels.every(k => Object.hasOwn(probs, k) && probability(probs[k]))) return false;
        if (Math.abs(labels.reduce((a, k) => a + probs[k], 0) - 1) > 0.002) return false;
        if (probs[answer.choice] + 0.002 < Math.max(...Object.values(probs))) return false;
      }
      if (question.type === 'score') {
        const n = question.criteria?.length, values = answer.probabilities;
        if (!Array.isArray(question.criteria) || n < 2 || !object(values) && !Array.isArray(values)) return false;
        if (Object.keys(values).length !== n || !Array.from({length:n}, (_,i) => Object.hasOwn(values,i) && probability(values[i])).every(Boolean)) return false;
        let sum = 0, mean = 0; for (let i = 0; i < n; i++) { sum += values[i]; mean += i * values[i]; }
        if (!finite(answer.score) || answer.score < 0 || answer.score > n - 1 || Math.abs(sum - 1) > 0.002 || Math.abs(mean - answer.score) > 0.002 * n) return false;
      }
      return true;
    });
  });
}

/** Perfil serial consultivo. Conserva q:{} legado para probes de transporte; o modelo valida a questão final. */
export class LayaTransport {
  #worker; #failures = 0; #openUntil = 0;
  constructor({ command, startMs = 90000, deadlineMs = 4000, maxFrameBytes = 2097152,
    shutdownMs = 1500, graceMs = 250 } = {}) {
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 300000) throw new TypeError('INVALID_LAYA_DEADLINE');
    this.deadlineMs = deadlineMs;
    this.#worker = new JsonLineWorker({ command, startMs, maxBytes:maxFrameBytes, shutdownMs, graceMs,
      acceptReady: m => m?.op === 'ready' && m.ok === true && ['laya','torch','device'].every(k => typeof m[k] === 'string' && m[k].length > 0 && m[k].length <= 128) && finite(m.loadMs) && m.loadMs >= 0 });
  }
  get info() {
    const ready = this.#worker.ready;
    return ready ? {laya:ready.laya,torch:ready.torch,device:ready.device,loadMs:ready.loadMs} : null;
  }
  start() { return this.#worker.start(); }
  stop() { return this.#worker.stop(); }
  stats() { return {...this.#worker.stats(), breakerOpen:performance.now() < this.#openUntil, cacheEnabled:false}; }
  async decide(states, questions, options = {}) {
    if (!object(options) || Object.keys(options).some(k => !['maxLen','deadlineMs','signal'].includes(k))) return {ok:false,reason:'INVALID_REQUEST'};
    const {maxLen = 1024, deadlineMs = this.deadlineMs, signal} = options;
    if (!Array.isArray(states) || states.length < 1 || states.length > 64 || states.some(s => typeof s !== 'string' || s.length > 50000) ||
        !object(questions) || Object.keys(questions).length < 1 || Object.keys(questions).length > 16 ||
        !Number.isSafeInteger(maxLen) || maxLen < 32 || maxLen > 8192 ||
        states.length * Object.keys(questions).length > 128 || states.length * Object.keys(questions).length * maxLen > 131072)
      return {ok:false,reason:'INVALID_REQUEST'};
    let request;
    try {
      const encoded = JSON.stringify({op:'decide',states,questions,maxLen});
      if (Buffer.byteLength(encoded) > 1048320) return {ok:false,reason:'REQUEST_TOO_LARGE'};
      request = JSON.parse(encoded); // Não retém arrays mutáveis durante o cold start.
      if (!Object.values(request.questions).every(object)) return {ok:false,reason:'INVALID_REQUEST'};
    } catch { return {ok:false,reason:'INVALID_REQUEST'}; }
    if (performance.now() < this.#openUntil) return {ok:false,reason:'DEGRADED'};
    const result = await this.#worker.request(request, {deadlineMs,signal,validate:m => validLayaReply(m,request)});
    if (!result.ok && ['BUSY','CANCELLED','INVALID_REQUEST','REQUEST_TOO_LARGE'].includes(result.reason)) return result;
    if (!result.ok || result.message.ok === false) {
      if (++this.#failures >= 3) { this.#failures = 0; this.#openUntil = performance.now() + 300000; await this.#worker.stop(); }
      return result.ok ? {ok:false,reason:'ERROR'} : result;
    }
    this.#failures = 0;
    return {ok:true,results:result.message.results,ms:result.message.ms};
  }
}
