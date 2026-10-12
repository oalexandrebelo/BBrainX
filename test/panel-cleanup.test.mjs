import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {PanelCleanup} from './fixtures/panel-cleanup.mjs';

test('panel fixture closes listener and database before removing its directory', async () => {
  const cleanup=new PanelCleanup(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-cleanup-order-'));
  const order=[];let db,server;
  cleanup.defer(()=>{
    assert.equal(db.isOpen,false,'database must be closed before removal');
    assert.equal(server.listening,false,'listener must be closed before removal');
    fs.rmSync(dir,{recursive:true,force:true});order.push('directory');
  });
  try {
    db=new DatabaseSync(path.join(dir,'state.sqlite'));db.exec('CREATE TABLE check_order(id)');
    cleanup.defer(()=>{db.close();order.push('database');});
    server=http.createServer((_,res)=>res.end('owned fixture'));
    cleanup.defer(async()=>{
      server.closeAllConnections();
      await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));order.push('listener');
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    assert.equal(await (await fetch('http://127.0.0.1:'+server.address().port)).text(),'owned fixture');
    await cleanup.close();
    assert.deepEqual(order,['listener','database','directory']);assert(!fs.existsSync(dir));
  } finally {
    // Keep the negative control from leaking real resources if order is intentionally sabotaged.
    if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}
    if(db?.isOpen)db.close();fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('cleanup failure does not prevent the remaining releases and stays observable', async () => {
  const cleanup=new PanelCleanup(),sequence=[],cause=new Error('intentional-cleanup-failure');
  cleanup.defer(()=>sequence.push('last'));
  cleanup.defer(()=>{sequence.push('failed');throw cause;});
  cleanup.defer(async()=>{await new Promise(resolve=>setImmediate(resolve));sequence.push('first');});
  await assert.rejects(cleanup.close(),e=>e instanceof AggregateError&&e.errors.length===1&&e.errors[0]===cause);
  assert.deepEqual(sequence,['first','failed','last']);
});

test('concurrent fixture cleanup is one awaited operation and rejects late registrations', async () => {
  const cleanup=new PanelCleanup();let calls=0;
  cleanup.defer(async()=>{await new Promise(resolve=>setImmediate(resolve));calls++;});
  const a=cleanup.close(),b=cleanup.close();assert.strictEqual(a,b);
  assert.throws(()=>cleanup.defer(()=>{}),/INVALID_CLEANUP_REGISTRATION/);
  await a;await b;assert.equal(calls,1);assert.strictEqual(cleanup.close(),a);
});
