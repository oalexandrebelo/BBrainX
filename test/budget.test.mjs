import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BrainStore} from '../src/store.mjs';
import {setBudget,budgetOverview} from '../src/budget.mjs';

test('advisory budgets use CAS, project authority and exact separate currency/basis totals',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-budget-')),brain=new BrainStore(path.join(temp,'state'));
 for(const id of ['a','b']){fs.mkdirSync(path.join(temp,id));brain.register(id,path.join(temp,id));}
 t.after(()=>{brain.close();fs.rmSync(temp,{recursive:true,force:true});});
 const empty={money:[],truncated:false,moneyTruncated:false};assert.equal(budgetOverview(brain,'a',empty).configured,false);
 assert.equal(setBudget(brain,{project:'a',amount:'0.3',currency:'USD'}).version,1);
 assert.throws(()=>setBudget(brain,{project:'a',amount:'1',currency:'USD'}),{code:'VERSION_CONFLICT'});
 assert.equal(budgetOverview(brain,'a',empty).status,'unknown');assert.equal(budgetOverview(brain,'b',empty).configured,false);
 const usage={...empty,money:[{currency:'USD',basis:'reported',amount:'0.1',missingCalls:0},{currency:'USD',basis:'estimated',amount:'999',missingCalls:0},{currency:'BRL',basis:'reported',amount:'999',missingCalls:0}]};
 const result=budgetOverview(brain,'a',usage);assert.equal(result.remainingObserved,'0.2');assert.equal(result.status,'within-imported');assert.equal(result.enforcesProviderSpending,false);
 usage.money[0].amount='0.300000000001';assert.equal(budgetOverview(brain,'a',usage).status,'reached');assert.equal(budgetOverview(brain,'a',usage).remainingObserved,'-0.000000000001');
 usage.money[0].amount='0.1';usage.truncated=true;assert.equal(budgetOverview(brain,'a',usage).status,'partial');
 assert.throws(()=>setBudget(brain,{project:'b',amount:'NaN',currency:'USD'}));assert.throws(()=>setBudget(brain,{project:'b',amount:'0',currency:'USD'}));
});
