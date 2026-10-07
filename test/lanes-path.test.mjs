import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {laneFixture} from './fixtures/lane-setup.mjs';
import {gitWorkspace} from '../src/lanes/registry.mjs';

test('workspace path matches the native filesystem spelling after Git resolves it',t=>{
 const f=laneFixture(t,{register:false});
 for(const source of [f.primary,f.alpha,f.beta]){
  const observed=gitWorkspace(source);
  assert.equal(observed.root,fs.realpathSync.native(source));
  const actual=fs.statSync(source,{bigint:true}),returned=fs.statSync(observed.root,{bigint:true});
  assert.equal(returned.dev,actual.dev);assert.equal(returned.ino,actual.ino);
 }
});
test('normalized host root and dot path bind the same lane without broadening scope',t=>{
 const f=laneFixture(t,{register:false});
 const first=f.registry.register(f.authority,'product','a',path.join(f.alpha,'.'));
 const again=f.registry.register(f.authority,'product','a',fs.realpathSync.native(f.alpha));
 assert.equal(first.epoch,again.epoch);assert.equal(again.duplicate,true);
 assert.equal(f.registry.home,fs.realpathSync.native(f.home));
});
