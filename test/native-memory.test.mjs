import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {infrastructurePlan,GiB} from '../src/infrastructure.mjs';
test('teto nativo acima de MAX_SAFE_INTEGER é limitado à RAM, sem promover perfil',()=>{
 const result=infrastructurePlan({totalMemoryBytes:16*GiB,cpuCount:8,constrainedMemoryBytes:2**64});
 assert.equal(result.selected,'MEDIUM');assert.equal(result.hardware.effectiveMemoryBytes,16*GiB);assert.equal(result.hardware.constraintAbovePhysical,true);
 for(const value of [NaN,Infinity,-1,1.2,'0'])assert.throws(()=>infrastructurePlan({totalMemoryBytes:16*GiB,cpuCount:8,constrainedMemoryBytes:value}));
});
test('sondagem nativa usa o limite real sem arredondar o host',()=>{
 const totalMemoryBytes=os.totalmem(),cpuCount=os.availableParallelism(),constrainedMemoryBytes=process.constrainedMemory?.()??0;
 const result=infrastructurePlan({totalMemoryBytes,cpuCount,constrainedMemoryBytes});
 assert(result.hardware.effectiveMemoryBytes<=totalMemoryBytes);assert.equal(result.measuredMedium,false);
 assert(['LOW','MEDIUM',null].includes(result.selected));
});
