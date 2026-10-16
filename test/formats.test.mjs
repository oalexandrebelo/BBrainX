import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { zip, unzip, parseCsv, csvToXlsx, columnName, markdownToDocx, textToPdf, extractPdfText } from '../src/formats.mjs';

// Verificador mínimo de XML bem-formado: tags balanceadas, raiz única, atributos sem repetição, entidades válidas.
function assertWellFormed(source,label){
  const body=source.replace(/^\uFEFF?<\?xml[^?]*\?>\s*/,'');
  const TOKEN=/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>|<|&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g;
  const stack=[];let roots=0,last=0;
  for(const match of body.matchAll(TOKEN)){
    const between=body.slice(last,match.index);last=match.index+match[0].length;
    assert.ok(stack.length||!between.trim(),`${label}: texto fora da raiz: ${between.slice(0,40)}`);
    assert.ok(match[0]!=='<'&&match[0]!=='&',`${label}: '${match[0]}' solto em ${match.index}: ${body.slice(match.index,match.index+60)}`);
    if(!match[2])continue;
    const [,closing,name,attrs,selfClosing]=match;
    if(closing){assert.equal(attrs.trim()+selfClosing,'',`${label}: tag de fechamento com atributos`);assert.equal(stack.pop(),name,`${label}: </${name}> desbalanceada`);continue;}
    const names=[...attrs.matchAll(/([A-Za-z_][\w:.-]*)\s*=/g)].map(m=>m[1]);
    assert.equal(new Set(names).size,names.length,`${label}: atributo repetido em <${name}>`);
    if(!stack.length)roots++;
    if(!selfClosing)stack.push(name);
  }
  assert.ok(!body.slice(last).trim(),`${label}: conteúdo após a raiz`);
  assert.deepEqual(stack,[],`${label}: tags abertas`);
  assert.equal(roots,1,`${label}: raiz única`);
}
const wellFormedParts=(files,label)=>{for(const [name,data] of files)if(/\.(xml|rels)$/.test(name))assertWellFormed(data.toString('utf8'),`${label}:${name}`);};

test('zip e unzip fazem roundtrip com nomes UTF-8, arquivo vazio e CRC do zlib',()=>{
  const entries=[{name:'a.txt',data:'olá mundo '.repeat(80)},{name:'pasta/ação 漢.md',data:Buffer.from('# título')},{name:'vazio.txt',data:''},{name:'aleatorio.bin',data:Buffer.from(Array.from({length:64},(_,i)=>(i*97)&255))}];
  const archive=zip(entries),files=unzip(archive);
  assert.deepEqual([...files.keys()],entries.map(e=>e.name));
  for(const e of entries)assert.deepEqual(files.get(e.name),Buffer.isBuffer(e.data)?e.data:Buffer.from(e.data));
  assert.equal(files.get('vazio.txt').length,0);
  assert.deepEqual(zip(entries),archive,'saída determinística');
  const end=archive.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));let at=archive.readUInt32LE(end+16);
  for(const e of entries){
    assert.equal(archive.readUInt32LE(at),0x02014b50);
    assert.equal(archive.readUInt16LE(at+8)&0x0800,0x0800,'flag UTF-8');
    assert.equal(archive.readUInt16LE(at+14),0x21,'data DOS 1980-01-01');
    assert.equal(archive.readUInt32LE(at+16),zlib.crc32(files.get(e.name)));
    assert.equal(archive.toString('utf8',at+46,at+46+archive.readUInt16LE(at+28)),e.name);
    at+=46+archive.readUInt16LE(at+28);
  }
  assert.equal(archive.readUInt16LE(8),8,'texto repetitivo sai com deflate');
  assert.throws(()=>zip([{name:'x',data:''},{name:'x',data:''}]),{code:'ZIP_ENTRY'});
  assert.throws(()=>zip([{name:'../fora',data:''}]),{code:'ZIP_ENTRY'});
  const corrupt=Buffer.from(archive);corrupt[30+5]^=0xff;
  assert.throws(()=>unzip(corrupt),{code:'ZIP_ENTRY'});
  assert.throws(()=>unzip(Buffer.from('nada aqui que pareça zip')),{code:'ZIP_INVALID'});
});

test('parseCsv segue RFC 4180 e detecta ; e tab',()=>{
  assert.deepEqual(parseCsv('nome,obs\n"Silva, Ana","disse ""oi""\r\nem duas linhas"\r\nB,2\n'),[['nome','obs'],['Silva, Ana','disse "oi"\r\nem duas linhas'],['B','2']]);
  assert.deepEqual(parseCsv('\uFEFFproduto;valor;obs\nCafé;1.234,56;"a;b"\n'),[['produto','valor','obs'],['Café','1.234,56','a;b']]);
  assert.deepEqual(parseCsv('a\tb\n1\t2'),[['a','b'],['1','2']]);
  assert.deepEqual(parseCsv('a;b,c\n',{delimiter:','}),[['a;b','c']]);
  assert.deepEqual(parseCsv('a,,\n\n,b'),[['a','',''],[''],['','b']]);
  assert.deepEqual(parseCsv(''),[]);
});

test('csvToXlsx gera OOXML mínimo com números, texto escapado e cabeçalho em negrito',()=>{
  const csv='\uFEFFproduto;preço;qtd;cep\n"<Café & Cia>";1.234,56;-3;01310100\nChá;1234.5;1.234;"linha\nquebrada"\n';
  const files=unzip(csvToXlsx(csv,{sheetName:'Vendas: 2026/10'}));
  for(const part of ['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/worksheets/sheet1.xml','xl/styles.xml'])assert.ok(files.has(part),part);
  wellFormedParts(files,'xlsx');
  const sheet=files.get('xl/worksheets/sheet1.xml').toString('utf8');
  assert.match(sheet,/<c r="B2"><v>1234\.56<\/v><\/c>/);
  assert.match(sheet,/<c r="B3"><v>1234\.5<\/v><\/c>/);
  assert.match(sheet,/<c r="C2"><v>-3<\/v><\/c>/);
  assert.match(sheet,/<c r="C3"><v>1234<\/v><\/c>/,'milhar brasileiro com ;');
  assert.match(sheet,/<c r="A2" t="inlineStr"><is><t xml:space="preserve">&lt;Café &amp; Cia&gt;<\/t><\/is><\/c>/);
  assert.match(sheet,/<c r="D2" t="inlineStr"><is><t xml:space="preserve">01310100<\/t>/,'zero à esquerda continua texto');
  assert.match(sheet,/<c r="D3" t="inlineStr"><is><t xml:space="preserve">linha\nquebrada<\/t>/);
  assert.match(sheet,/<c r="A1" s="1" t="inlineStr">/);
  assert.doesNotMatch(sheet,/r="A2" s="1"/);
  const styles=files.get('xl/styles.xml').toString('utf8');
  const fonts=[...styles.matchAll(/<font>([\s\S]*?)<\/font>/g)].map(m=>m[1]),xfs=[...styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf [^>]*>/g)].map(m=>m[0]);
  assert.match(fonts[Number(/fontId="(\d+)"/.exec(xfs[1])[1])],/<b\/>/,'estilo 1 usa fonte em negrito');
  assert.match(files.get('xl/workbook.xml').toString('utf8'),/<sheet name="Vendas_ 2026_10"/);
  const comma=unzip(csvToXlsx('a,b\n"1.234,56",2.5\n')).get('xl/worksheets/sheet1.xml').toString('utf8');
  assert.match(comma,/<c r="A2" t="inlineStr"><is><t xml:space="preserve">1\.234,56</);
  assert.match(comma,/<c r="B2"><v>2\.5<\/v>/);
  const wide=unzip(csvToXlsx(Array.from({length:30},(_,i)=>`c${i}`).join(','))).get('xl/worksheets/sheet1.xml').toString('utf8');
  for(const ref of ['A1','Z1','AA1','AD1'])assert.match(wide,new RegExp(`r="${ref}"`));
  assert.deepEqual([0,25,26,27,701,702,16383].map(columnName),['A','Z','AA','AB','ZZ','AAA','XFD']);
  assert.throws(()=>csvToXlsx(','.repeat(16384)),{code:'XLSX_LIMIT'});
  assert.throws(()=>csvToXlsx('x\n'.repeat(1048577)),{code:'XLSX_LIMIT'});
});

const SAMPLE=`# Proposta Comercial

Primeiro parágrafo com **negrito**, *itálico*, _ênfase_ e \`código\`
continua na linha seguinte <tag> & "aspas"\u0007.

## Escopo

- item um
- item **dois**
1. passo inicial

> citação importante

---

\`\`\`js
const a = 1;
  if (a < 2) {}
\`\`\`

### Tabela

| Coluna | Valor |
|---|---|
| x | 1 |
`;

test('markdownToDocx gera WordprocessingML bem-formado com estilos e formatação',()=>{
  const files=unzip(markdownToDocx(SAMPLE,{title:'Proposta & Cia'}));
  for(const part of ['[Content_Types].xml','_rels/.rels','word/document.xml','word/_rels/document.xml.rels','word/styles.xml','docProps/core.xml'])assert.ok(files.has(part),part);
  wellFormedParts(files,'docx');
  const doc=files.get('word/document.xml').toString('utf8');
  assert.match(doc,/<w:pStyle w:val="Heading1"\/><\/w:pPr><w:r><w:t xml:space="preserve">Proposta Comercial<\/w:t>/);
  assert.match(doc,/<w:pStyle w:val="Heading2"\/><\/w:pPr><w:r><w:t xml:space="preserve">Escopo</);
  assert.match(doc,/<w:pStyle w:val="Heading3"\/>/);
  assert.doesNotMatch(doc,/w:val="Title"/,'H1 inicial dispensa parágrafo de título');
  assert.match(doc,/<w:r><w:rPr><w:b\/><w:bCs\/><\/w:rPr><w:t xml:space="preserve">negrito<\/w:t><\/w:r>/);
  assert.match(doc,/<w:r><w:rPr><w:i\/><w:iCs\/><\/w:rPr><w:t xml:space="preserve">itálico<\/w:t>/);
  assert.match(doc,/<w:r><w:rPr><w:i\/><w:iCs\/><\/w:rPr><w:t xml:space="preserve">ênfase<\/w:t>/);
  assert.match(doc,/<w:rStyle w:val="Code"\/><\/w:rPr><w:t xml:space="preserve">código<\/w:t>/);
  assert.match(doc,/ continua na linha seguinte &lt;tag&gt; &amp; &quot;aspas&quot;\.</,'linhas suaves unidas e XML escapado');
  assert.ok(!doc.includes('\u0007'),'caractere de controle removido');
  assert.match(doc,/const a = 1;<\/w:t><w:br\/><w:t xml:space="preserve">  if \(a &lt; 2\) \{\}<\/w:t>/);
  assert.match(doc,/<w:t xml:space="preserve">•<\/w:t><w:tab\/><\/w:r><w:r><w:t xml:space="preserve">item um</);
  assert.match(doc,/<w:t xml:space="preserve">1\.<\/w:t><w:tab\/>/);
  assert.match(doc,/<w:ind w:left="567"\/><\/w:pPr><w:r><w:rPr><w:i\/><w:iCs\/><\/w:rPr><w:t xml:space="preserve">citação importante/);
  assert.match(doc,/<w:pBdr><w:bottom w:val="single"/);
  assert.match(doc,/<w:tbl>[\s\S]*Coluna[\s\S]*<\/w:tbl><w:p\/><w:sectPr>/);
  const styles=files.get('word/styles.xml').toString('utf8');
  for(const id of ['Normal','Title','Heading1','Heading2','Heading3','Code'])assert.match(styles,new RegExp(`w:styleId="${id}"`));
  assert.match(files.get('docProps/core.xml').toString('utf8'),/<dc:title>Proposta &amp; Cia<\/dc:title>/);
  const titled=unzip(markdownToDocx('Só um parágrafo.',{title:'Relatório'})).get('word/document.xml').toString('utf8');
  assert.match(titled,/<w:pStyle w:val="Title"\/><\/w:pPr><w:r><w:t xml:space="preserve">Relatório</);
  assertWellFormed(unzip(markdownToDocx('')).get('word/document.xml').toString('utf8'),'docx vazio');
});

test('DOCX é lido pelo conversor nativo do macOS (textutil)',t=>{
  if(process.platform!=='darwin'||!fs.existsSync('/usr/bin/textutil'))return t.skip('componente opcional ausente: /usr/bin/textutil (só macOS)');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbx-formats-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'proposta.docx');fs.writeFileSync(file,markdownToDocx(SAMPLE));
  const output=execFileSync('/usr/bin/textutil',['-convert','txt','-stdout',file],{encoding:'utf8'});
  assert.match(output,/Proposta Comercial/);
  assert.match(output,/negrito/);
  assert.match(output,/if \(a < 2\)/);
});

function pdfStructure(buffer){
  const source=buffer.toString('latin1');
  assert.ok(source.startsWith('%PDF-1.4\n'));
  assert.ok(source.trimEnd().endsWith('%%EOF'));
  const xref=Number(/startxref\n(\d+)\n%%EOF\s*$/.exec(source)[1]);
  assert.ok(source.startsWith('xref\n',xref),'startxref aponta para a tabela');
  const [,first,count]=/^xref\n(\d+) (\d+)\n/.exec(source.slice(xref));
  assert.equal(first,'0');
  const rows=source.slice(xref).split('\n').slice(2,2+Number(count));
  assert.equal(rows[0],'0000000000 65535 f ');
  rows.slice(1).forEach((row,i)=>{
    assert.match(row,/^\d{10} 00000 n $/);
    assert.ok(source.startsWith(`${i+1} 0 obj\n`,Number(row.slice(0,10))),`offset do objeto ${i+1}`);
  });
  assert.match(source,new RegExp(`/Size ${count} `));
  return {source,pages:(source.match(/\/Type \/Page\b(?!s)/g)||[]).length};
}

test('textToPdf gera PDF 1.4 com xref exato, WinAnsi, paginação e avisos',()=>{
  const long=Array.from({length:70},(_,i)=>`Parágrafo ${i+1} da proposta com texto suficiente para ocupar mais de uma linha na página A4 e forçar quebra de linha e de página.`).join('\n\n');
  const md=`# Proposta\n\nAção “aspas” ‘simples’ – travessão — € … • **forte** e *leve*\n\n- item com marcador\n\n\`\`\`\ncódigo (com) \\barra\n\`\`\`\n\n${long}\n\n漢字`;
  const {buffer,warnings}=textToPdf(md,{title:'Proposta Ação 漢'});
  const {source,pages}=pdfStructure(buffer);
  assert.ok(pages>1,`${pages} páginas`);
  assert.match(source,/\/Count \d+/);
  assert.match(source,/\/Producer \(BBrainX\)/);
  assert.match(source,new RegExp(`/Title <FEFF${Buffer.from('Proposta Ação 漢','utf16le').swap16().toString('hex').toUpperCase()}>`));
  for(const font of ['Helvetica','Helvetica-Bold','Helvetica-Oblique','Courier'])assert.match(source,new RegExp(`/BaseFont /${font} /Encoding /WinAnsiEncoding`));
  const text=extractPdfText(buffer);
  for(const fragment of ['Proposta','Ação “aspas” ‘simples’ – travessão — € … • forte e leve','código (com) \\barra','•\nitem com marcador',`1 / ${pages}`,`${pages} / ${pages}`,'??'])assert.ok(text.includes(fragment),`texto extraído contém ${fragment}`);
  assert.equal(warnings.length,1);
  assert.equal(warnings[0].code,'PDF_UNMAPPED_CHARS');
  assert.equal(warnings[0].count,2);
  assert.equal(warnings[0].sample,'漢字');
  const paragraph=text.split('\n').filter(line=>line.startsWith('Parágrafo 1 '));
  assert.equal(paragraph.length,1);
  assert.ok(!paragraph[0].endsWith('página.'),'parágrafo longo quebra em mais de uma linha');
  assert.deepEqual(textToPdf(md).buffer,textToPdf(md).buffer,'saída determinística');
});

test('textToPdf em modo texto preserva linhas em Courier e quebra as longas',()=>{
  const {buffer,warnings}=textToPdf(`linha 1\n**não é markdown**\n\n${'x'.repeat(200)}`,{markdown:false,title:'notas.txt'});
  pdfStructure(buffer);
  assert.deepEqual(warnings,[]);
  const lines=extractPdfText(buffer).split('\n');
  assert.deepEqual(lines.slice(0,5),['linha 1','**não é markdown**','x'.repeat(80),'x'.repeat(80),'x'.repeat(40)]);
  assert.match(buffer.toString('latin1'),/\/Count 1 /);
  assert.ok(lines.includes('1 / 1'));
});
