import assert from 'node:assert/strict';
import { WitnessCache, digest } from './witness-cache.mjs';

// Estado sintético do host; não lê o filesystem nem executa inferência.
const cache=new WitnessCache();
cache.setGrant('example','reader',true,0);
cache.updateResources('example',[
  {name:'policy/context',digest:digest('policy-v1'),expectedVersion:0},
  {name:'content/auth',digest:digest('function auth() {}'),expectedVersion:0}
]);
const request={project:'example',principal:'reader',kind:'artifact',queryHash:digest('outline'),contractHash:digest('parser-v1'),dependencies:['policy/context','content/auth']};
const ticket=cache.begin(request);
assert.equal(cache.lookup(ticket),null);
cache.commit(ticket,'{"symbols":["auth"]}');
const hit=cache.lookup(cache.begin(request));
assert.equal(hit.toString(),'{"symbols":["auth"]}');
cache.updateResources('example',[{name:'content/auth',digest:digest('function authenticate() {}'),expectedVersion:1}]);
const next=cache.begin(request);
assert.equal(cache.lookup(next),null);
cache.cancel(next);
console.log(JSON.stringify({example:'synthetic-host-state',firstHit:JSON.parse(hit.toString()),stats:cache.stats()},null,2));
