/**
 * Redação de credenciais em texto de diagnóstico (logs de recruta, erros de CLI, resumos) antes de gravar ou responder.
 * Formatos conhecidos de chave e cabeçalhos de autorização; o valor some, o rótulo fica para o diagnóstico continuar legível.
 */
const TOKENS = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)|\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[0-9A-Za-z-]{20,}|[sr]k_live_[0-9A-Za-z]{20,}|glpat-[0-9A-Za-z_-]{20,}|npm_[A-Za-z0-9]{36}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g;
const HEADERS = /\b(authorization|proxy-authorization|x-api-key|api-key|x-auth-token|cookie|set-cookie)(\s*[:=]\s*)(?:(bearer|basic|token)\s+)?("?)[^\s"',;]{6,}\4/gi;
const ASSIGNMENTS = /\b([A-Za-z0-9_]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key|password|passwd))(\s*[:=]\s*)("?)[^\s"',;]{6,}\3/gi;
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi;

export const REDACTED = '[redacted]';

export function redact(text) {
  if (typeof text !== 'string' || text.length === 0) return text;
  return text
    .replace(TOKENS, REDACTED)
    .replace(HEADERS, (_, name, sep, scheme) => name + sep + (scheme ? scheme + ' ' : '') + REDACTED)
    .replace(ASSIGNMENTS, (_, name, sep) => name + sep + REDACTED)
    .replace(URL_CREDENTIALS, (_, scheme) => scheme + REDACTED + '@');
}
