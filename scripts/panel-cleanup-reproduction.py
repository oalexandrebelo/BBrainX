"""Reproduce the old fixture's teardown ordering in an owned, bounded child.

The deliberately failing test is NOT the product suite. Its expected Windows
failure remains an artifact; a future change in behavior requires investigation.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

SOURCE = r'''import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bb-original-order-'));
const db=new DatabaseSync(path.join(directory,'brain.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE probe(id); INSERT INTO probe VALUES(1)');
console.log('probe-directory='+directory);
test('original fixture deletes files before closing the database',t=>{
  t.after(()=>{
    console.log('removal-before-close='+db.isOpen);
    fs.rmSync(directory,{recursive:true,force:true});
  });
  t.after(()=>{db.close();console.log('database-closed');});
});
'''

def main():
    root=Path(__file__).resolve().parents[1]
    output=root/'artifacts'/'panel-stage2'
    output.mkdir(parents=True,exist_ok=True)
    node=shutil.which('node')
    if node is None:
        raise RuntimeError('NODE_NOT_FOUND')
    with tempfile.TemporaryDirectory(prefix='bbrainx-cleanup-red-') as temp:
        temp=Path(temp)
        source=temp/'original-order.mjs'
        source.write_text(SOURCE,encoding='utf-8')
        env={**os.environ,'TMP':str(temp),'TEMP':str(temp),'TMPDIR':str(temp)}
        began=time.perf_counter()
        command=[node,'--test','--test-reporter=tap',str(source)]
        proc=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=env)
        timed_out=False
        try:
            raw,_=proc.communicate(timeout=15)
        except subprocess.TimeoutExpired:
            timed_out=True
            proc.kill()  # Exact child created above, no process-name or port matching.
            raw,_=proc.communicate(timeout=10)
        log=raw.decode('utf-8',errors='replace')
        expected=(not timed_out and 'removal-before-close=true' in log and
                  ((os.name=='nt' and proc.returncode!=0 and ('EPERM' in log or 'EBUSY' in log)) or
                   (os.name!='nt' and proc.returncode==0 and 'database-closed' in log)))
        (output/'original-cleanup.log').write_bytes(raw)
        report={'schemaVersion':1,'case':'old-test-fixture-order','platform':sys.platform,
                'exitCode':proc.returncode,'timedOut':timed_out,'expectedBehaviorObserved':expected,
                'sourceSha256':hashlib.sha256(SOURCE.encode()).hexdigest(),
                'logSha256':hashlib.sha256(raw).hexdigest(),'durationMs':(time.perf_counter()-began)*1000,
                'productionTest':False,'limitations':['Minimal original ordering, not the entire previous job.','POSIX permits unlink of this open DB in this test; that is not a cleanup design guarantee.']}
        (output/'original-cleanup.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(report))
        return 0 if expected else 1

if __name__=='__main__':
    raise SystemExit(main())
