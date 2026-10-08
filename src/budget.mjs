import {ensure} from './primitives.mjs';
import {decimalUnits,moneyText} from './usage/contract.mjs';

function latest(brain,project){
  const row=brain.db.prepare("SELECT payload FROM events WHERE project=? AND type='control.budget' ORDER BY seq DESC LIMIT 1").get(project);
  return row?JSON.parse(row.payload):null;
}
/** Host CLI only. Versioned advisory limit over imported receipts; cannot govern another harness's API calls. */
export function setBudget(brain,{project,amount,currency,basis='reported',expectedVersion=0}){
  brain.project(project);const pico=decimalUnits(amount,12);
  ensure(pico>0n&&/^[A-Z]{3}$/.test(currency)&&['reported','estimated'].includes(basis),'INVALID_BUDGET');
  ensure(Number.isSafeInteger(expectedVersion)&&expectedVersion>=0,'INVALID_BUDGET_VERSION');
  return brain.transaction(()=>{
    const previous=latest(brain,project);ensure((previous?.version??0)===expectedVersion,'VERSION_CONFLICT');
    const policy={version:expectedVersion+1,amount:moneyText(pico),currency,basis,scope:'all-imported-receipts',mode:'advisory',updatedAt:new Date().toISOString()};
    brain.event(project,'control.budget',policy);return policy;
  });
}
export function budgetOverview(brain,project,usage){
  brain.project(project);const policy=latest(brain,project);if(!policy)return {configured:false,enforcesProviderSpending:false};
  const money=usage.money.find(x=>x.currency===policy.currency&&x.basis===policy.basis);
  const known=money?decimalUnits(money.amount,12):null,limit=decimalUnits(policy.amount,12);
  const complete=!!money&&money.missingCalls===0&&!usage.truncated&&!usage.moneyTruncated;
  return {configured:true,...policy,observedAmount:money?.amount??null,remainingObserved:known===null?null:moneyText(limit-known),
    status:known===null?'unknown':known>=limit?'reached':complete?'within-imported':'partial',completeWithinImported:complete,
    enforcesProviderSpending:false,coverage:'Alerta sobre os recibos importados. Chamadas não instrumentadas e custos de assinatura são desconhecidos.'};
}
