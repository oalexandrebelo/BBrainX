import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { declarationsIn, maskDeclarations } from '../src/declarations.mjs';
import { definitions } from '../src/analyze.mjs';
import { BrainStore } from '../src/store.mjs';
import { indexProject } from '../src/retrieval.mjs';
import { symbolContext } from '../src/aci.mjs';

const names=(body,extension)=>[...declarationsIn(body,extension)].map(x=>x.name);
function indexed(t,body,extension='.mjs'){
  const dir=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-declarations-'))),root=path.join(dir,'repo');fs.mkdirSync(root);
  fs.writeFileSync(path.join(root,'code'+extension),body);
  const store=new BrainStore(path.join(dir,'state'));store.register('app',root);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  indexProject(store,'app');return {store,file:'code'+extension};
}

test('declarations: strings and comments cannot manufacture ECMAScript declarations',()=>{
  const body=[
    'const quoted = "export function quotedPhantom() {}";',
    "const escaped = 'it\\'s a class escapedPhantom {}';",
    'const template = `example',
    'export function templatePhantom() {}',
    '`;',
    '// export class linePhantom {}',
    '/* multiline',
    'export function blockPhantom() {}',
    '*/ export function actual() {}'
  ].join('\n');
  assert.deepEqual(names(body,'.mjs'),['actual','quoted','escaped','template']);
  assert.equal(definitions('/* export function commentOnly() {} */','.mjs'),'');
});
test('declarations: comment and string delimiters follow the source language',()=>{
  assert.deepEqual(names('"""example\ndef phantom():\n"""\n# def hidden():\ndef actual():\n    pass','.py'),['actual']);
  assert.deepEqual(names("-- CREATE TABLE line_phantom ();\n/* CREATE TABLE block_phantom (); */\nSELECT 'CREATE TABLE string_phantom ();';\nCREATE TABLE \"Ledger\" ();",'.sql'),['Ledger']);
  assert.deepEqual(names('# def hidden\nvalue = "def quoted"\ndef actual\nend','.rb'),['actual']);
  assert.deepEqual(names("pub fn borrow<'a>(value: &'a str) {}\npub fn actual() {}",'.rs'),['borrow','actual']);
  assert.deepEqual(names('const EXAMPLE: &str = r#"class rawPhantom { \"nested\" }"#;\npub fn actual() {}','.rs'),['EXAMPLE','actual']);
  assert.deepEqual(names('const example = `function rawPhantom() {}\\`;\nfunc (r Receiver) actual() {}','.go'),['example','actual']);
});
test('declarations: lexical masking preserves UTF-16 offsets and every CRLF newline',()=>{
  const body='const text = "😀";\r\n/* class phantom {}\r\n*/ export function actual() {}\r\n',masked=maskDeclarations(body,'.mjs');
  assert.equal(masked.length,body.length);
  assert.deepEqual([...masked.matchAll(/\r|\n/g)].map(x=>x.index),[...body.matchAll(/\r|\n/g)].map(x=>x.index));
  assert.equal(masked.indexOf('export function actual'),body.indexOf('export function actual'));
  assert.deepEqual(names(masked,'.mjs'),['actual','text']);
});
test('declarations: nested JavaScript template literals remain masked across interpolations',()=>{
  const body='const example = `outer ${`function nestedPhantom() {} ${"class quotedPhantom {}"}`} tail`;\nexport function actual() {}';
  assert.deepEqual(names(body,'.mjs'),['actual','example']);
  const tricky='const example = `outer ${ /* ` } */ ({value: /[`}]/, nested: `class hidden {} ${`function deeper() {}`}`})} tail`;\nexport class Actual {}';
  assert.deepEqual(names(tricky,'.mjs'),['Actual','example']);
  const deep='const example = `'+('${`'.repeat(12000))+'function deepPhantom() {}'+('`}'.repeat(12000))+'`;\nexport function actual() {}';
  assert.deepEqual(names(deep,'.mjs'),['actual','example']);
  assert.equal(maskDeclarations(deep,'.mjs').length,deep.length);
});
test('declarations: regular expressions and SQL dollar strings cannot hide or manufacture declarations',()=>{
  assert.deepEqual(names('const matcher = /function regexPhantom[\'"/]+/;\nexport function actual() {}','.mjs'),['actual','matcher']);
  assert.deepEqual(names('return /class returnPhantom/;\nexport class Actual {}','.ts'),['Actual']);
  assert.deepEqual(names('DO $$ CREATE TABLE dollar_phantom (); $$;\nDO $body$ CREATE FUNCTION tagged_phantom() $body$;\nCREATE TABLE actual ();','.sql'),['actual']);
  assert.deepEqual(names('=begin\ndef block_phantom\n=end\ndef actual\nend','.rb'),['actual']);
});
test('definitions: a long opening line retains multiline lexical state before the line ceiling is applied',()=>{
  assert.equal(definitions('const example = `'+'.'.repeat(2100)+'\nexport function phantom() {}\n`;\nexport function actual() {}','.mjs'),'actual');
});
test('declarations: valid single-character function and type names remain indexable',()=>{
  const body='export function f() {}\nexport class T {}\ntype U = T;\n';
  assert.deepEqual(names(body,'.ts'),['f','T','U']);
  assert.equal(definitions(body,'.ts'),'f T U');
});
test('ACI symbol: multiline strings and comments spanning chunks preserve true declaration lines',t=>{
  const lines=Array.from({length:140},()=>''),place=(line,value)=>{lines[line-1]=value;};
  place(1,'const example = `');place(61,'export function targetSymbol() {}');place(65,'`;');
  place(66,'/*');place(121,'export function targetSymbol() {}');place(125,'*/');
  place(130,'export function targetSymbol() {}');
  const f=indexed(t,lines.join('\n'));
  const result=symbolContext(f.store,{project:'app',symbol:'targetSymbol'});
  assert.deepEqual(result.items.map(({path,startLine,endLine,kind})=>({path,startLine,endLine,kind})),[{path:f.file,startLine:130,endLine:130,kind:'function'}]);
  assert.deepEqual(f.store.stmt("SELECT start_line FROM chunks WHERE project='app' AND instr(' '||defs||' ',' targetSymbol ')>0 ORDER BY start_line").all().map(x=>x.start_line),[121]);
});
test('ACI symbol: one-character names accepted by the schema resolve to indexed definitions',t=>{
  const f=indexed(t,'export function f() {}\nexport class T {}\n','.ts');
  for(const [symbol,line,kind] of [['f',1,'function'],['T',2,'class']]){
    const result=symbolContext(f.store,{project:'app',symbol});
    assert.deepEqual(result.items.map(({name,startLine,kind})=>({name,startLine,kind})),[{name:symbol,startLine:line,kind}]);
  }
});
