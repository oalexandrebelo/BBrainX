import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url)),source=path.join(root,'extensions','vscode');
const {values}=parseArgs({options:{out:{type:'string'}},allowPositionals:false});
const files=['package.json','extension.cjs','media/icon.svg','README.md','LICENSE'];
for(const file of files){const stat=fs.lstatSync(path.join(source,file));if(!stat.isFile()||stat.isSymbolicLink()||stat.size>262144)throw new Error('Unsafe extension package source: '+file);}
const manifest=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
if(!/^[a-z0-9-]+$/.test(manifest.name)||!/^[a-z0-9-]+$/.test(manifest.publisher)||!/^\d+\.\d+\.\d+$/.test(manifest.version))throw new Error('Invalid extension identity');
const output=path.resolve(values.out||path.join(root,'artifacts','extensions',manifest.name+'-'+manifest.version+'.vsix'));
fs.mkdirSync(path.dirname(output),{recursive:true});if(fs.existsSync(output)&&fs.lstatSync(output).isSymbolicLink())throw new Error('Symlink output rejected');
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const vsix=`<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
 <Metadata>
  <Identity Language="en-US" Id="${xml(manifest.name)}" Version="${xml(manifest.version)}" Publisher="${xml(manifest.publisher)}"/>
  <DisplayName>${xml(manifest.displayName)}</DisplayName>
  <Description xml:space="preserve">${xml(manifest.description)}</Description>
  <Tags>BBrainX,local-preview</Tags><Categories>Other</Categories><GalleryFlags>Preview</GalleryFlags>
  <Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml(manifest.engines.vscode)}"/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/></Properties>
 </Metadata>
 <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
 <Assets>
  <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
  <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
  <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/>
 </Assets>
</PackageManifest>`;
const types=`<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/>
 <Default Extension="svg" ContentType="image/svg+xml"/><Default Extension="md" ContentType="text/plain"/>
 <Override PartName="/extension/LICENSE" ContentType="text/plain"/><Override PartName="/extension.vsixmanifest" ContentType="text/xml"/>
</Types>`;
const temporary=path.join(path.dirname(output),'.bbrainx-vsix-'+randomUUID()+'.tmp');
const script=`import os, sys, zipfile
output, source, manifest, types = sys.argv[1:5]
with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('extension.vsixmanifest', manifest)
    archive.writestr('[Content_Types].xml', types)
    for name in sys.argv[5:]:
        archive.write(os.path.join(source, name), 'extension/' + name)
`;
try{
  execFileSync(process.platform==='win32'?'python':'python3',['-c',script,temporary,source,vsix,types,...files],{timeout:30000,maxBuffer:65536,stdio:['ignore','pipe','pipe']});
  fs.renameSync(temporary,output);
}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
const bytes=fs.readFileSync(output);
console.log(JSON.stringify({path:output,version:manifest.version,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),files:files.length+2,preview:true,nativeActivationVerified:false},null,2));
