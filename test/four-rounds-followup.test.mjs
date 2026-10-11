import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable, Readable } from 'node:stream';
import { createEngine } from '../src/capability.mjs';
import { runEngineCli } from '../src/engine-cli.mjs';
import { engine, textCapability } from './fixtures/contract-engine.mjs';


test('capability names matching Object prototype fields are not accidentally remapped',async()=>{
  const e=createEngine({name:'x',version:'1',libraries:[{library:{name:'names',version:'1.0.0',capabilities:{constructor:textCapability(),toString:textCapability()}}}]});
  for(const id of ['constructor','toString'])assert.equal((await e.invoke(id,{text:'xx'},{principal:{id:'host'}})).length,2);
});
test('CLI observes write errors arriving after its timeout without unhandled late events',async()=>{
  const output=new Writable({write(_,__,done){setTimeout(()=>done(new Error('late-private-error')),40);}});
  let diagnostic='';const error=new Writable({write(chunk,_,done){diagnostic+=chunk;done();}});
  const code=await runEngineCli(engine(),{argv:['list'],principal:{id:'host'},input:Readable.from([]),output,error,deadlineMs:5});assert.equal(code,1);
  await new Promise(resolve=>setTimeout(resolve,65));assert(!diagnostic.includes('private'));assert.equal(output.listenerCount('error'),1);
});
