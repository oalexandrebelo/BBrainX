import { spawnSync } from 'node:child_process';
import { ensure } from './primitives.mjs';
import { unzip, extractPdfText } from './formats.mjs';

/**
 * Texto de PDF, DOCX e XLSX para o índice. Os arquivos ficam como estão (nada é gravado ao lado deles): o índice guarda
 * o texto extraído e o hash do arquivo original, então a verificação de frescor continua barata e exata.
 * PDF usa o PDFKit do próprio macOS (sem dependência nova); fora dele, ou se falhar, o extrator simples do BBrainX.
 */
export const DOCUMENT_EXTENSIONS = Object.freeze(['.pdf', '.docx', '.xlsx']);
export const DOCUMENT_LIMITS = Object.freeze({ fileBytes: 20 * 1048576, textChars: 1048576, pdfTimeoutMs: 30000 });

const decodeXml = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const PDFKIT = 'function run(argv){ObjC.import("PDFKit");const d=$.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0]));if(!d||d.isNil())return "";const s=d.string;return (s&&!s.isNil())?s.js:"";}';

function pdf(full, bytes, platform) {
  if (platform === 'darwin') {
    // O caminho vai como argumento, nunca dentro do script; saída limitada e com prazo.
    const r = spawnSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', PDFKIT, full], { encoding: 'utf8', timeout: DOCUMENT_LIMITS.pdfTimeoutMs, maxBuffer: 16 * 1048576, windowsHide: true, env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME ?? '' } });
    if (!r.error && r.status === 0 && r.stdout.trim()) return r.stdout;
  }
  try { return extractPdfText(bytes); } catch { return ''; }
}
function docx(bytes) {
  const xml = unzip(bytes, { maxBytes: 64 * 1048576 }).get('word/document.xml');
  ensure(xml, 'DOCUMENT_UNREADABLE', 'DOCX sem word/document.xml.');
  return decodeXml(xml.toString('utf8').replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, ''));
}
function xlsx(bytes) {
  const files = unzip(bytes, { maxBytes: 64 * 1048576 });
  const shared = [...(files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => decodeXml(m[1].replace(/<[^>]+>/g, '')));
  const sheets = [...files.keys()].filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const out = [];
  for (const name of sheets) {
    out.push('## ' + name.match(/sheet(\d+)/)[0]);
    for (const row of files.get(name).toString('utf8').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [...row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(([, attrs, inner = '']) => {
        if (/t="s"/.test(attrs)) return shared[Number(inner.match(/<v>(\d+)<\/v>/)?.[1])] ?? '';
        if (/t="inlineStr"/.test(attrs)) return decodeXml(inner.replace(/<[^>]+>/g, ''));
        return decodeXml(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '');
      });
      if (cells.some(Boolean)) out.push(cells.join('\t'));
    }
  }
  return out.join('\n');
}
/** Texto do documento, sem caracteres de controle além de quebra e tab; vazio (PDF escaneado sem camada de texto) é recusado. */
export function extractDocument(full, extension, bytes, { platform = process.platform } = {}) {
  let text;
  try { text = extension === '.pdf' ? pdf(full, bytes, platform) : extension === '.docx' ? docx(bytes) : extension === '.xlsx' ? xlsx(bytes) : null; }
  catch (e) { if (e.name === 'BrainError') throw e; ensure(false, 'DOCUMENT_UNREADABLE', 'Documento ilegível: ' + (e.code || e.message)); }
  ensure(text !== null, 'DOCUMENT_UNREADABLE');
  text = text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  ensure(text.length > 0, 'DOCUMENT_TEXT_EMPTY', 'Documento sem texto extraível (por exemplo, PDF escaneado).');
  return text.length > DOCUMENT_LIMITS.textChars ? text.slice(0, DOCUMENT_LIMITS.textChars) : text;
}
