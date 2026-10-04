"""Empacota somente arquivos rastreados, nunca .git, credenciais ou node_modules."""
from pathlib import Path
import hashlib
import subprocess
import zipfile

root=Path.cwd()
files=subprocess.check_output(['git','ls-files','-z']).decode('utf-8').split('\0')
output=root/'artifacts'/'BBrainX-v0.4.0-source.zip'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=7) as archive:
    for name in sorted(filter(None,files)):
        file=root/name
        if file.is_file() and not file.is_symlink():
            archive.write(file,'BBrainX/'+name)
digest=hashlib.sha256(output.read_bytes()).hexdigest()
(output.parent/'SHA256SUMS.txt').write_text(f'{digest}  {output.name}\n',encoding='utf-8')
print(f'{output.name}: {output.stat().st_size} bytes; sha256={digest}')
