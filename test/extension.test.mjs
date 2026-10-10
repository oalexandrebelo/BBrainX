import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url)),extension=path.join(root,'extensions','vscode');
test('extension manifest gates execution settings at machine scope and keeps native view accessible',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(extension,'package.json'),'utf8'));
  assert.equal(manifest.displayName,'BBrainX');assert.equal(manifest.publisher,'bbrainxlocal');assert.equal(manifest.main,'./extension.cjs');
  assert.equal(manifest.capabilities.untrustedWorkspaces.supported,'limited');assert.equal(manifest.capabilities.virtualWorkspaces.supported,false);
  for(const property of Object.values(manifest.contributes.configuration.properties))assert.equal(property.scope,'machine');
  const commands=manifest.contributes.commands.map(command=>command.command);assert.deepEqual(commands,['bbrainx.detect','bbrainx.connect','bbrainx.openPanel','bbrainx.startPanel']);
  assert.equal(manifest.contributes.views.bbrainx[0].id,'bbrainx.workspaces');
  const icon=fs.readFileSync(path.join(extension,'media/icon.svg'),'utf8'),brand=fs.readFileSync(path.join(root,'public/brand/icon.svg'),'utf8');
  const paths=svg=>[...svg.matchAll(/<path\s+d="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(paths(icon),paths(brand));assert.doesNotMatch(icon,/<rect\b/,'Activity Bar uses the transparent glyph as a monochrome mask');
  execFileSync(process.execPath,['--check',path.join(extension,'extension.cjs')],{timeout:10000,stdio:'pipe'});
});

test('real local VSIX contains exactly the reviewed files and consistent XML/JSON identity',t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-vsix-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const output=path.join(temp,'package with spaces.vsix');
  const result=JSON.parse(execFileSync(process.execPath,[path.join(root,'scripts/package-extension.mjs'),'--out',output],{timeout:30000,encoding:'utf8'}));
  assert.equal(result.path,output);assert.equal(result.preview,true);assert.equal(result.nativeActivationVerified,false);assert.match(result.sha256,/^[a-f0-9]{64}$/);
  const script=`import json, sys, zipfile, xml.etree.ElementTree as ET
with zipfile.ZipFile(sys.argv[1]) as archive:
    assert archive.testzip() is None
    files = sorted(archive.namelist())
    namespace = {'v': 'http://schemas.microsoft.com/developer/vsx-schema/2011'}
    xml = ET.fromstring(archive.read('extension.vsixmanifest'))
    ET.fromstring(archive.read('[Content_Types].xml'))
    identity = xml.find('v:Metadata/v:Identity', namespace).attrib
    manifest = json.loads(archive.read('extension/package.json'))
    assert identity['Id'] == manifest['name']
    assert identity['Publisher'] == manifest['publisher']
    assert identity['Version'] == manifest['version']
    print(json.dumps({'files': files, 'identity': identity}))
`;
  const inspected=JSON.parse(execFileSync(process.platform==='win32'?'python':'python3',['-c',script,output],{timeout:10000,encoding:'utf8'}));
  assert.deepEqual(inspected.files,['[Content_Types].xml','extension.vsixmanifest','extension/LICENSE','extension/README.md','extension/extension.cjs','extension/media/icon.svg','extension/package.json']);
});
