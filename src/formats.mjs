/**
 * Geradores de documento sem dependência: ZIP, CSV→XLSX, Markdown→DOCX e texto→PDF.
 * Só node:zlib; saída determinística (sem datas embutidas) para que o mesmo conteúdo gere os mesmos bytes.
 */
import zlib from 'node:zlib';
import {ensure} from './primitives.mjs';

const MAX_INPUT=32*1024*1024;
function input(value,name){ensure(typeof value==='string'&&value.length<=MAX_INPUT,'INVALID_INPUT',`${name} deve ser texto de até 32 MiB`);return value;}
// XML 1.0 rejeita controles e surrogates soltos; eles somem antes de qualquer serialização.
const CONTROL=/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const clean=value=>value.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(CONTROL,'');
const xml=value=>value.replace(CONTROL,'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const XML_HEAD='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// ---------- ZIP ----------
// 1980-01-01 00:00 fixo: o pacote sai byte a byte reproduzível, sem vazar o relógio da máquina.
const DOS_DATE=(1<<5)|1;
function header(buffer,at,{method,crc,size,raw,name}){
  buffer.writeUInt16LE(20,at);buffer.writeUInt16LE(0x0800,at+2);buffer.writeUInt16LE(method,at+4);
  buffer.writeUInt16LE(0,at+6);buffer.writeUInt16LE(DOS_DATE,at+8);buffer.writeUInt32LE(crc,at+10);
  buffer.writeUInt32LE(size,at+14);buffer.writeUInt32LE(raw,at+18);buffer.writeUInt16LE(name,at+22);
}
export function zip(entries){
  ensure(Array.isArray(entries)&&entries.length<0xFFFF,'ZIP_INVALID','entries deve ser lista com menos de 65535 itens');
  const parts=[],central=[],seen=new Set();let offset=0;
  for(const entry of entries){
    const name=entry?.name;
    ensure(typeof name==='string'&&name.length>0&&name.length<=1024&&!name.startsWith('/')&&!name.split(/[\\/]/).includes('..')&&!seen.has(name),'ZIP_ENTRY',`nome de entrada inválido ou repetido: ${name}`);
    seen.add(name);
    const raw=Buffer.isBuffer(entry.data)?entry.data:typeof entry.data==='string'?Buffer.from(entry.data,'utf8'):null;
    ensure(raw,'ZIP_ENTRY',`data de ${name} deve ser Buffer ou string`);
    const deflated=zlib.deflateRawSync(raw,{level:9}),stored=deflated.length>=raw.length,body=stored?raw:deflated;
    const nameBytes=Buffer.from(name,'utf8'),fields={method:stored?0:8,crc:zlib.crc32(raw),size:body.length,raw:raw.length,name:nameBytes.length};
    // Sem ZIP64: os documentos gerados aqui ficam muito abaixo de 4 GiB, então o limite vira erro explícito.
    ensure(offset+30+nameBytes.length+body.length<0xFFFFFFFF,'ZIP_LIMIT','pacote acima de 4 GiB exige ZIP64');
    const local=Buffer.alloc(30),dir=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50,0);header(local,4,fields);
    dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);header(dir,6,fields);dir.writeUInt32LE(offset,42);
    parts.push(local,nameBytes,body);central.push(dir,nameBytes);offset+=30+nameBytes.length+body.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...parts,directory,end]);
}
export function unzip(buffer,{maxBytes=512*1024*1024}={}){
  ensure(Buffer.isBuffer(buffer)&&buffer.length>=22,'ZIP_INVALID','buffer ZIP ausente ou curto demais');
  let end=-1;
  for(let i=buffer.length-22;i>=Math.max(0,buffer.length-22-0xFFFF);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
  ensure(end>=0,'ZIP_INVALID','fim do diretório central não encontrado');
  const count=buffer.readUInt16LE(end+10),start=buffer.readUInt32LE(end+16);
  ensure(start+buffer.readUInt32LE(end+12)<=end,'ZIP_INVALID','diretório central fora do arquivo');
  const files=new Map();let at=start,total=0;
  for(let n=0;n<count;n++){
    ensure(at+46<=end&&buffer.readUInt32LE(at)===0x02014b50,'ZIP_INVALID','entrada do diretório central corrompida');
    const flags=buffer.readUInt16LE(at+8),method=buffer.readUInt16LE(at+10),crc=buffer.readUInt32LE(at+16),size=buffer.readUInt32LE(at+20),raw=buffer.readUInt32LE(at+24);
    const nameLength=buffer.readUInt16LE(at+28),local=buffer.readUInt32LE(at+42);
    const name=buffer.toString(flags&0x0800?'utf8':'latin1',at+46,at+46+nameLength);
    ensure(local+30<=start&&buffer.readUInt32LE(local)===0x04034b50,'ZIP_INVALID',`cabeçalho local de ${name} corrompido`);
    const data=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
    ensure(!(flags&1)&&(method===0||method===8)&&data+size<=start&&!files.has(name),'ZIP_ENTRY',`${name}: cifrada, repetida, método ${method} ou fora dos limites`);
    // O tamanho declarado limita a descompressão: uma bomba de zip estoura aqui, não na memória.
    total+=raw;ensure(total<=maxBytes,'ZIP_LIMIT',`conteúdo descompactado acima de ${maxBytes} bytes`);
    const body=buffer.subarray(data,data+size);let content;
    try{content=method===0?Buffer.from(body):raw===0?Buffer.alloc(0):zlib.inflateRawSync(body,{maxOutputLength:raw});}
    catch(error){ensure(false,'ZIP_ENTRY',`${name}: deflate inválido (${error.code||error.message})`);}
    ensure(content.length===raw&&zlib.crc32(content)===crc,'ZIP_ENTRY',`${name}: tamanho ou CRC divergente`);
    files.set(name,content);at+=46+nameLength+buffer.readUInt16LE(at+30)+buffer.readUInt16LE(at+32);
  }
  return files;
}

// ---------- CSV ----------
function detectDelimiter(text){
  const counts={',':0,';':0,'\t':0};let quoted=false;
  for(const c of text){
    if(c==='"')quoted=!quoted;
    else if(!quoted){if(c==='\n'||c==='\r')break;if(c in counts)counts[c]++;}
  }
  return Object.entries(counts).reduce((best,next)=>next[1]>best[1]?next:best)[0];
}
export function parseCsv(text,{delimiter}={}){
  const source=input(text,'csv').replace(/^\uFEFF/,''),sep=delimiter??detectDelimiter(source);
  ensure(typeof sep==='string'&&sep.length===1&&!'"\r\n'.includes(sep),'INVALID_INPUT','delimitador deve ser um único caractere');
  const rows=[];let row=[],field='',quoted=false,i=0;
  while(i<source.length){
    const c=source[i];
    if(quoted){
      if(c!=='"'){field+=c;i++;}
      else if(source[i+1]==='"'){field+='"';i+=2;}
      else{quoted=false;i++;}
    }else if(c==='"'&&field===''){quoted=true;i++;}
    else if(c===sep){row.push(field);field='';i++;}
    else if(c==='\n'||c==='\r'){row.push(field);rows.push(row);row=[];field='';i+=c==='\r'&&source[i+1]==='\n'?2:1;}
    else{field+=c;i++;}
  }
  if(field!==''||row.length||quoted){row.push(field);rows.push(row);}
  return rows;
}

// ---------- XLSX ----------
const PLAIN_NUMBER=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const BR_NUMBER=/^-?(?:[1-9]\d{0,2}(?:\.\d{3})+|0|[1-9]\d*)(?:,\d+)?$/;
// Zero à esquerda (CEP, código) e mais de 15 dígitos (precisão do double) continuam texto.
function numeric(value,brazilian){
  let candidate=null;
  if(brazilian&&/[.,]/.test(value)&&BR_NUMBER.test(value))candidate=value.replace(/\./g,'').replace(',','.');
  else if(PLAIN_NUMBER.test(value))candidate=value;
  if(candidate===null||candidate.replace(/[eE].*$/,'').replace(/\D/g,'').replace(/^0+/,'').length>15)return null;
  const number=Number(candidate);
  return Number.isFinite(number)?String(number):null;
}
export function columnName(index){
  let name='';
  for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;
  return name;
}
const sheetTitle=value=>String(value).replace(CONTROL,'').replace(/[[\]:*?/\\]/g,'_').replace(/^'+|'+$/g,'').trim().slice(0,31)||'Planilha';
const XLSX_STYLES=`${XML_HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
export function csvToXlsx(text,{sheetName='Planilha',delimiter}={}){
  input(text,'csv');
  const sep=delimiter??detectDelimiter(text.replace(/^\uFEFF/,'')),rows=parseCsv(text,{delimiter:sep});
  ensure(rows.length<=1048576,'XLSX_LIMIT',`${rows.length} linhas excedem o limite do Excel (1.048.576)`);
  const width=rows.reduce((max,row)=>Math.max(max,row.length),0);
  ensure(width<=16384,'XLSX_LIMIT',`${width} colunas excedem o limite do Excel (16.384)`);
  const names=Array.from({length:width},(_,i)=>columnName(i)),widths=new Array(width).fill(0);
  // Decimal com vírgula só faz sentido em CSV com ';' — com ',' a vírgula já é separador.
  const brazilian=sep===';';
  const body=rows.map((row,r)=>`<row r="${r+1}">${row.map((raw,c)=>{
    const value=raw.replace(/\r\n?/g,'\n').replace(CONTROL,'');
    if(value==='')return '';
    ensure(value.length<=32767,'XLSX_LIMIT',`célula ${names[c]}${r+1} acima de 32.767 caracteres`);
    widths[c]=Math.max(widths[c],Math.min(60,value.length));
    const head=`<c r="${names[c]}${r+1}"${r===0?' s="1"':''}`,number=numeric(value.trim(),brazilian);
    return number!==null?`${head}><v>${number}</v></c>`:`${head} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const cols=widths.map((w,i)=>w?`<col min="${i+1}" max="${i+1}" width="${Math.max(8,w+2)}" customWidth="1"/>`:'').join('');
  const dimension=rows.length&&width?`<dimension ref="A1:${names[width-1]}${rows.length}"/>`:'';
  const sheet=`${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${dimension}${cols?`<cols>${cols}</cols>`:''}<sheetData>${body}</sheetData></worksheet>`;
  const ns='http://schemas.openxmlformats.org/officeDocument/2006/relationships',type='application/vnd.openxmlformats-officedocument.spreadsheetml';
  return zip([
    {name:'[Content_Types].xml',data:`${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${type}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${type}.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${type}.styles+xml"/></Types>`},
    {name:'_rels/.rels',data:`${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:'xl/workbook.xml',data:`${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${ns}"><sheets><sheet name="${xml(sheetTitle(sheetName))}" sheetId="1" r:id="rId1"/></sheets></workbook>`},
    {name:'xl/_rels/workbook.xml.rels',data:`${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${ns}/styles" Target="styles.xml"/></Relationships>`},
    {name:'xl/worksheets/sheet1.xml',data:sheet},
    {name:'xl/styles.xml',data:XLSX_STYLES},
  ]);
}

// ---------- Markdown (blocos e inline, compartilhado por DOCX e PDF) ----------
const FENCE=/^\s{0,3}(`{3,}|~{3,})/;
const HEADING=/^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE=/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE=/^\s{0,3}>\s?/;
const LIST=/^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const ROW=/^\s*\|.*\|\s*$/;
const DIVIDER=/^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const isTable=(lines,i)=>ROW.test(lines[i])&&DIVIDER.test(lines[i+1]??'')&&lines[i+1].includes('|');
const cells=line=>line.trim().replace(/^\||\|$/g,'').split(/(?<!\\)\|/).map(cell=>cell.trim().replace(/\\\|/g,'|'));
const starts=(lines,i)=>FENCE.test(lines[i])||HEADING.test(lines[i])||RULE.test(lines[i])||QUOTE.test(lines[i])||LIST.test(lines[i])||isTable(lines,i);
const expandTabs=line=>line.replace(/\t/g,'    ');
function markdownBlocks(markdown){
  const lines=clean(markdown).split('\n'),blocks=[];let i=0,match;
  while(i<lines.length){
    const line=lines[i];
    if(!line.trim()){i++;continue;}
    if((match=FENCE.exec(line))){
      const close=new RegExp(`^\\s{0,3}${match[1][0]==='`'?'`':'~'}{${match[1].length},}\\s*$`),body=[];
      for(i++;i<lines.length&&!close.test(lines[i]);i++)body.push(expandTabs(lines[i]));
      blocks.push({type:'code',lines:body});i++;continue;
    }
    if((match=HEADING.exec(line))){blocks.push({type:'heading',level:Math.min(3,match[1].length),text:match[2]});i++;continue;}
    // Regra antes de lista: "* * *" e "---" são separadores, não itens.
    if(RULE.test(line)){blocks.push({type:'hr'});i++;continue;}
    if(QUOTE.test(line)){
      const body=[];while(i<lines.length&&QUOTE.test(lines[i]))body.push(lines[i++].replace(QUOTE,'').trim());
      blocks.push({type:'quote',text:body.filter(Boolean).join(' ')});continue;
    }
    if(isTable(lines,i)){
      const rows=[cells(lines[i])];for(i+=2;i<lines.length&&ROW.test(lines[i]);i++)rows.push(cells(lines[i]));
      blocks.push({type:'table',rows});continue;
    }
    if((match=LIST.exec(line))){
      let text=match[3].trim();
      for(i++;i<lines.length&&lines[i].trim()&&!starts(lines,i);i++)text+=' '+lines[i].trim();
      const ordered=/\d/.test(match[2]);
      blocks.push({type:'item',ordered,marker:ordered?match[2].slice(0,-1)+'.':'•',level:Math.min(6,Math.floor(expandTabs(match[1]).length/2)),text});continue;
    }
    // Linhas quebradas no mesmo parágrafo viram um texto só, como no Markdown renderizado.
    const body=[line.trim()];
    for(i++;i<lines.length&&lines[i].trim()&&!starts(lines,i);i++)body.push(lines[i].trim());
    blocks.push({type:'paragraph',text:body.join(' ')});
  }
  return blocks;
}
const INLINE=/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|(?<![\p{L}\p{N}*])\*(?![\s*])([\s\S]*?[^\s*])\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_(?![\s_])([\s\S]*?[^\s_])_(?![\p{L}\p{N}_])/gu;
// Escapes "\*" viram caracteres de uso privado durante o parse e voltam no fim.
const hide=value=>value.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g,(_,c)=>String.fromCharCode(0xE000+c.charCodeAt(0)));
const reveal=value=>value.replace(/[\uE000-\uE07F]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xE000));
function inline(text,style={}){
  const out=[],push=(value,extra)=>{if(value)out.push({...style,...extra,text:reveal(value)});};
  const source=hide(text);let last=0;
  for(const match of source.matchAll(INLINE)){
    push(source.slice(last,match.index));
    if(match[1])push(match[2].replace(/^ (.+) $/,'$1'),{code:true});
    else if(match[3]??match[4])out.push(...inline(reveal(match[3]??match[4]),{...style,bold:true}));
    else out.push(...inline(reveal(match[5]??match[6]),{...style,italic:true}));
    last=match.index+match[0].length;
  }
  push(source.slice(last));
  return out;
}

// ---------- DOCX ----------
const W_NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const wText=value=>value.split('\t').map(part=>part?`<w:t xml:space="preserve">${xml(part)}</w:t>`:'').join('<w:tab/>');
const wRuns=segments=>segments.map(s=>{
  const props=(s.code?'<w:rStyle w:val="Code"/>':'')+(s.bold?'<w:b/><w:bCs/>':'')+(s.italic?'<w:i/><w:iCs/>':'');
  return `<w:r>${props?`<w:rPr>${props}</w:rPr>`:''}${wText(s.text)}</w:r>`;
}).join('');
const wPara=(props,content)=>`<w:p>${props?`<w:pPr>${props}</w:pPr>`:''}${content}</w:p>`;
const BORDER='w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"';
function wTable(rows){
  const width=Math.max(...rows.map(row=>row.length)),col=Math.floor(9638/width);
  const borders=['top','left','bottom','right','insideH','insideV'].map(side=>`<w:${side} ${BORDER}/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr><w:tblGrid>${`<w:gridCol w:w="${col}"/>`.repeat(width)}</w:tblGrid>${rows.map((row,r)=>
    `<w:tr>${r===0?'<w:trPr><w:tblHeader/></w:trPr>':''}${Array.from({length:width},(_,c)=>`<w:tc><w:tcPr><w:tcW w:w="${col}" w:type="dxa"/></w:tcPr>${wPara('<w:spacing w:before="40" w:after="40"/>',wRuns(inline(row[c]??'',r===0?{bold:true}:{})))}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
}
function headingStyle(level,size,before){
  return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="120"/><w:outlineLvl w:val="${level-1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
}
const DOCX_STYLES=`${XML_HEAD}<w:styles xmlns:w="${W_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style>${headingStyle(1,32,360)}${headingStyle(2,26,280)}${headingStyle(3,24,240)}<w:style w:type="character" w:styleId="Code"><w:name w:val="Code"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style></w:styles>`;
const firstHeading=blocks=>blocks.find(block=>block.type==='heading')?.text.replace(/[*_`]/g,'');
export function markdownToDocx(markdown,{title}={}){
  const blocks=markdownBlocks(input(markdown,'markdown'));
  ensure(title===undefined||typeof title==='string','INVALID_INPUT','title deve ser texto');
  const body=[];
  // O título só vira parágrafo quando o próprio Markdown não abre com um H1 (evita título duplicado).
  if(title&&!(blocks[0]?.type==='heading'&&blocks[0].level===1))body.push(wPara('<w:pStyle w:val="Title"/>',wRuns(inline(clean(title)))));
  for(const block of blocks){
    if(block.type==='heading')body.push(wPara(`<w:pStyle w:val="Heading${block.level}"/>`,wRuns(inline(block.text))));
    else if(block.type==='paragraph')body.push(wPara('',wRuns(inline(block.text))));
    // Tab explícito no recuo: leitores fora do Word (Quick Look, Pages) não criam a parada implícita do recuo deslocado.
    else if(block.type==='item')body.push(wPara(`<w:tabs><w:tab w:val="left" w:pos="${720+360*block.level}"/></w:tabs><w:spacing w:after="60"/><w:ind w:left="${720+360*block.level}" w:hanging="360"/>`,`<w:r><w:t xml:space="preserve">${xml(block.marker)}</w:t><w:tab/></w:r>${wRuns(inline(block.text))}`));
    else if(block.type==='quote')body.push(wPara(`<w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="BFBFBF"/></w:pBdr><w:ind w:left="567"/>`,wRuns(inline(block.text,{italic:true}))));
    else if(block.type==='hr')body.push(wPara('<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>',''));
    else if(block.type==='code')body.push(wPara('<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:before="0" w:after="160" w:line="240" w:lineRule="auto"/>',`<w:r><w:rPr><w:rStyle w:val="Code"/></w:rPr>${block.lines.map(wText).join('<w:br/>')}</w:r>`));
    else if(block.type==='table')body.push(wTable(block.rows));
  }
  // Word exige parágrafo depois de tabela final e ao menos um parágrafo no corpo.
  if(!body.length||blocks.at(-1)?.type==='table')body.push('<w:p/>');
  const document=`${XML_HEAD}<w:document xmlns:w="${W_NS}"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const docTitle=clean(title||firstHeading(blocks)||'Documento');
  const core=`${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(docTitle)}</dc:title><dc:creator>BBrainX</dc:creator></cp:coreProperties>`;
  const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zip([
    {name:'[Content_Types].xml',data:`${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`},
    {name:'_rels/.rels',data:`${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`},
    {name:'word/document.xml',data:document},
    // Sem esta relação o Word ignora styles.xml e os títulos perdem Heading1-3.
    {name:'word/_rels/document.xml.rels',data:`${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/styles" Target="styles.xml"/></Relationships>`},
    {name:'word/styles.xml',data:DOCX_STYLES},
    {name:'docProps/core.xml',data:core},
  ]);
}

// ---------- PDF ----------
// CP1252 0x80-0x9F; zero marca posição indefinida no WinAnsiEncoding.
const CP1252=[0x20AC,0,0x201A,0x0192,0x201E,0x2026,0x2020,0x2021,0x02C6,0x2030,0x0160,0x2039,0x0152,0,0x017D,0,0,0x2018,0x2019,0x201C,0x201D,0x2022,0x2013,0x2014,0x02DC,0x2122,0x0161,0x203A,0x0153,0,0x017E,0x0178];
const TO_WIN=new Map(CP1252.flatMap((u,i)=>u?[[u,0x80+i]]:[]));
const fromWin=code=>code>=0x80&&code<0xA0?String.fromCodePoint(CP1252[code-0x80]||0xFFFD):String.fromCharCode(code);
const SPACES=/[\u2000-\u200A\u202F\u205F\u3000]/,INVISIBLE=/[\u200B-\u200D\u2060\uFEFF]/,DASHES=/[\u2010\u2011\u2212]/;
function winAnsi(text,stats){
  let out='';
  for(const ch of text.normalize('NFC')){
    const u=ch.codePointAt(0);
    if(u===9)out+='    ';
    else if(u<32||u===127||(u>=0x80&&u<0xA0)||INVISIBLE.test(ch))continue;
    else if(u<256)out+=ch;
    else if(TO_WIN.has(u))out+=String.fromCharCode(TO_WIN.get(u));
    else if(SPACES.test(ch))out+=' ';
    else if(DASHES.test(ch))out+='-';
    else{out+='?';stats.count++;if(stats.sample.length<16&&!stats.sample.includes(ch))stats.sample+=ch;}
  }
  return out;
}
// Larguras AFM (1/1000 em) das fontes padrão no WinAnsi: 32-126, 128-159 e 160-255.
function metrics(ascii,special,high){
  const table=new Array(256).fill(0);
  ascii.forEach((w,i)=>{table[32+i]=w;});special.forEach((w,i)=>{table[128+i]=w;});high.forEach((w,i)=>{table[160+i]=w;});
  return table;
}
const D10=new Array(10).fill(556);
const HELVETICA=metrics(
  [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,...D10,278,278,584,584,584,556,1015,
    667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,
    556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
  [556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667],
  [278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,
    667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,
    556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500]);
const HELVETICA_BOLD=metrics(
  [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,...D10,333,333,584,584,584,611,975,
    722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,
    556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584],
  [556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667],
  [278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,
    722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,
    556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556]);
const FONTS={F1:['Helvetica',HELVETICA],F2:['Helvetica-Bold',HELVETICA_BOLD],F3:['Helvetica-Oblique',HELVETICA],F4:['Courier',null],F5:['Helvetica-BoldOblique',HELVETICA_BOLD]};
function measure(font,text,size){
  const table=FONTS[font][1];
  if(!table)return text.length*0.6*size;
  let sum=0;for(let i=0;i<text.length;i++)sum+=table[text.charCodeAt(i)];
  return sum*size/1000;
}
const PAGE_W=595.28,PAGE_H=841.89,MARGIN=56,CONTENT_W=PAGE_W-2*MARGIN;
// Quebra gulosa por palavra; palavra maior que a linha é cortada por caractere.
function wrap(runs,max){
  const lines=[];let line=[],width=0,space=null;
  const flush=()=>{lines.push(line);line=[];width=0;space=null;};
  const add=seg=>{const last=line.at(-1);if(last&&last.font===seg.font&&last.size===seg.size)last.text+=seg.text;else line.push({font:seg.font,size:seg.size,text:seg.text});width+=seg.w;};
  for(const run of runs)for(const token of run.text.split(/( +)/)){
    if(!token)continue;
    if(token[0]===' '){if(line.length)space={...run,text:' ',w:measure(run.font,' ',run.size)};continue;}
    let word=token,w=measure(run.font,word,run.size);
    if(line.length&&width+(space?.w??0)+w>max)flush();
    else if(space)add(space);
    space=null;
    while(w>max-width&&word.length>1){
      let k=1;while(k<word.length-1&&measure(run.font,word.slice(0,k+1),run.size)<=max-width)k++;
      const piece=word.slice(0,k);add({...run,text:piece,w:measure(run.font,piece,run.size)});flush();
      word=word.slice(k);w=measure(run.font,word,run.size);
    }
    add({...run,text:word,w});
  }
  if(line.length||!lines.length)lines.push(line);
  return lines;
}
function wrapMono(text,columns){
  const out=[];let rest=text;
  while(rest.length>columns){
    const cut=rest.lastIndexOf(' ',columns);const at=cut>columns/2?cut:columns;
    out.push(rest.slice(0,at));rest=rest.slice(at===cut?at+1:at);
  }
  out.push(rest);return out;
}
const fontOf=s=>s.code?'F4':s.bold&&s.italic?'F5':s.bold?'F2':s.italic?'F3':'F1';
const num=value=>String(Math.round(value*100)/100);
const pdfString=value=>'('+value.replace(/[\\()]/g,'\\$&').replace(/[^\x20-\x7E]/g,c=>'\\'+c.charCodeAt(0).toString(8).padStart(3,'0'))+')';
function layout(text,{markdown,title},stats){
  const pages=[],top=PAGE_H-MARGIN,enc=value=>winAnsi(value,stats);let ops,y;
  const newPage=()=>{ensure(pages.length<20000,'PDF_LIMIT','documento acima de 20.000 páginas');ops=[];pages.push(ops);y=top;};
  newPage();
  const runs=(segments,size)=>segments.map(s=>({font:fontOf(s),size:s.code?size*0.92:size,text:enc(s.text)}));
  const place=(lines,{size,lh,x=MARGIN,before=0,after=0,reserve=lh,lead,bar})=>{
    if(y<top)y-=before;
    if(y-reserve<MARGIN)newPage();
    lines.forEach((line,i)=>{
      if(y-lh<MARGIN)newPage();
      const base=y-lh/2-size*0.3;
      if(i===0&&lead)ops.push({x:lead.x,y:base,segs:[lead.seg]});
      if(line.length)ops.push({x,y:base,segs:line});
      if(bar!==undefined)ops.push({line:[bar,y,bar,y-lh],gray:0.75,width:2});
      y-=lh;
    });
    y-=after;
  };
  if(!markdown){
    const size=10,columns=Math.floor(CONTENT_W/(0.6*size));
    place(clean(text).split('\n').flatMap(line=>wrapMono(enc(line),columns)).map(line=>line?[{font:'F4',size,text:line}]:[]),{size,lh:size*1.25});
  }else{
    const blocks=markdownBlocks(text);
    if(title&&!(blocks[0]?.type==='heading'&&blocks[0].level===1))blocks.unshift({type:'heading',level:0,text:clean(title)});
    for(const block of blocks){
      if(block.type==='heading'){
        const size=[24,20,16,13][block.level],lh=size*1.25,lines=wrap(runs(inline(block.text,{bold:true}),size),CONTENT_W);
        // Título não fica órfão no pé da página: reserva espaço para duas linhas de corpo.
        place(lines,{size,lh,before:size*0.7,after:4,reserve:lh*lines.length+30});
      }else if(block.type==='paragraph')place(wrap(runs(inline(block.text),11),CONTENT_W),{size:11,lh:11*1.35,after:6});
      else if(block.type==='item'){
        const x=MARGIN+14*block.level,marker=enc(block.marker),hang=Math.max(14,measure('F1',marker,11)+6);
        place(wrap(runs(inline(block.text),11),CONTENT_W-(x-MARGIN)-hang),{size:11,lh:11*1.35,x:x+hang,after:3,lead:{x,seg:{font:'F1',size:11,text:marker}}});
      }else if(block.type==='quote')place(wrap(runs(inline(block.text,{italic:true}),11),CONTENT_W-16),{size:11,lh:11*1.35,x:MARGIN+16,before:4,after:6,bar:MARGIN+5});
      else if(block.type==='code'){
        const size=9.5,columns=Math.floor((CONTENT_W-8)/(0.6*size));
        place(block.lines.flatMap(line=>wrapMono(enc(line),columns)).map(line=>line?[{font:'F4',size,text:line}]:[]),{size,lh:size*1.3,x:MARGIN+8,before:2,after:8});
      }else if(block.type==='hr'){
        if(y<top)y-=6;
        if(y-12<MARGIN)newPage();
        ops.push({line:[MARGIN,y-6,PAGE_W-MARGIN,y-6],gray:0.6,width:0.75});y-=18;
      }else if(block.type==='table'){
        // Tabela simplificada: uma linha por registro, células separadas por " | " com espaço inquebrável (o wrap colapsaria espaços comuns), cabeçalho em negrito.
        block.rows.forEach((row,r)=>{
          const segments=row.flatMap((cell,c)=>[...(c?[{text:'\u00A0\u00A0|\u00A0\u00A0'}]:[]),...inline(cell,r===0?{bold:true}:{})]);
          place(wrap(runs(segments,10),CONTENT_W),{size:10,lh:13,after:r===block.rows.length-1?8:1});
        });
      }
    }
  }
  pages.forEach((page,i)=>{
    const label=`${i+1} / ${pages.length}`;
    page.push({x:(PAGE_W-measure('F1',label,9))/2,y:28,segs:[{font:'F1',size:9,text:label}],gray:0.4});
  });
  return pages;
}
const stream=ops=>ops.map(op=>op.line
  ?`q ${op.gray} G ${op.width} w ${num(op.line[0])} ${num(op.line[1])} m ${num(op.line[2])} ${num(op.line[3])} l S Q`
  :`${op.gray?`q ${op.gray} g `:''}BT ${num(op.x)} ${num(op.y)} Td ${op.segs.map(s=>`/${s.font} ${num(s.size)} Tf ${pdfString(s.text)} Tj`).join(' ')} ET${op.gray?' Q':''}`).join('\n');
export function textToPdf(text,{title,markdown=true}={}){
  input(text,'texto');
  ensure(title===undefined||typeof title==='string','INVALID_INPUT','title deve ser texto');
  const stats={count:0,sample:''},pages=layout(text,{markdown,title},stats);
  const docTitle=clean(title||(markdown&&firstHeading(markdownBlocks(text)))||'Documento');
  const fonts=Object.keys(FONTS),info=8,firstPage=info+1;
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_,i)=>`${firstPage+2*i} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    ...fonts.map(key=>`<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[key][0]} /Encoding /WinAnsiEncoding >>`),
    // Título em UTF-16BE: os metadados aceitam qualquer Unicode, ao contrário do corpo em WinAnsi.
    `<< /Title <FEFF${Buffer.from(docTitle,'utf16le').swap16().toString('hex').toUpperCase()}> /Producer (BBrainX) >>`,
  ];
  const resources=`<< /Font << ${fonts.map((key,i)=>`/${key} ${3+i} 0 R`).join(' ')} >> >>`;
  pages.forEach((ops,i)=>{
    const data=zlib.deflateSync(Buffer.from(stream(ops),'latin1'));
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources ${resources} /Contents ${firstPage+2*i+1} 0 R >>`);
    objects.push(Buffer.concat([Buffer.from(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`,'latin1'),data,Buffer.from('\nendstream','latin1')]));
  });
  const chunks=[Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n','latin1')],offsets=[];let position=chunks[0].length;
  objects.forEach((body,i)=>{
    const chunk=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`,'latin1'),Buffer.isBuffer(body)?body:Buffer.from(body,'latin1'),Buffer.from('\nendobj\n','latin1')]);
    offsets.push(position);chunks.push(chunk);position+=chunk.length;
  });
  chunks.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${position}\n%%EOF\n`,'latin1'));
  const warnings=stats.count?[{code:'PDF_UNMAPPED_CHARS',count:stats.count,sample:stats.sample,detail:`${stats.count} caractere(s) fora do WinAnsi trocado(s) por "?"`}]:[];
  return {buffer:Buffer.concat(chunks),warnings};
}
const ESCAPES={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f','\n':'','\r':''};
const decodeLiteral=token=>token.slice(1,-1).replace(/\\([0-7]{1,3}|[\s\S])/g,(_,e)=>/^[0-7]/.test(e)?String.fromCharCode(parseInt(e,8)&255):ESCAPES[e]??e).replace(/[\x80-\xFF]/g,c=>fromWin(c.charCodeAt(0)));
const PDF_TOKEN=/\((?:\\[\s\S]|[^\\)])*\)|<[0-9A-Fa-f\s]*>|\[|\]|\/[^\s()<>[\]/]*|[^\s()<>[\]/]+/g;
export function extractPdfText(buffer){
  ensure(Buffer.isBuffer(buffer),'INVALID_INPUT','extractPdfText espera Buffer');
  const source=buffer.toString('latin1'),out=[];
  for(const match of source.matchAll(/<<((?:(?!endobj)[\s\S])*?)>>\s*stream\r?\n/g)){
    const start=match.index+match[0].length,length=/\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(match[1]);
    let data=Buffer.from(source.slice(start,length?start+Number(length[1]):source.indexOf('endstream',start)),'latin1');
    if(/\/FlateDecode/.test(match[1])){try{data=zlib.inflateSync(data);}catch{continue;}}
    let line='',pending=[];
    for(const [token] of data.toString('latin1').matchAll(PDF_TOKEN)){
      if(token[0]==='(')pending.push(decodeLiteral(token));
      else if(token==='Tj'||token==='TJ'||token==="'"||token==='"'){line+=pending.join('');pending=[];}
      else if(token==='ET'){if(line)out.push(line);line='';pending=[];}
      else if(token!=='['&&token!==']'&&token[0]!=='/'&&!/^[-+.\d]/.test(token))pending=[];
    }
  }
  return out.join('\n');
}
