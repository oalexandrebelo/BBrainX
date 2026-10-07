import test from 'node:test';
import assert from 'node:assert/strict';
import { WitnessCache, digest } from './witness-cache.mjs';

function setup(limits={}){
  let now=0;const c=new WitnessCache({clock:()=>now,...limits});
  c.setGrant('P','alice',true,0);
  const names=['policy/context','content/a','content/b','index/generation','memory/revision','task/t','model/revision','calibration/revision','state/s'];
  const versions=new Map(names.map(n=>[n,1]));
  c.updateResources('P',names.map(name=>({name,digest:digest(name+'=1'),expectedVersion:0})));
  const request=(extra={})=>({project:'P',principal:'alice',kind:'artifact',queryHash:digest('query'),contractHash:digest('contract'),dependencies:['policy/context','content/a'],...extra});
  const put=(body='answer',extra={})=>c.commit(c.begin(request(extra)),body);
  const get=(extra={})=>{const ticket=c.begin(request(extra)),v=c.lookup(ticket);if(v===null)c.cancel(ticket);return v;};
  const update=(name,value)=>{const [r]=c.updateResources('P',[{name,digest:value===null?null:digest(value),expectedVersion:versions.get(name)??0}]);versions.set(name,r.version);return r;};
  return {c,request,put,get,update,versions,time:n=>now=n};
}
const throws=(fn,code)=>assert.throws(fn,{code});

test('hit preserva bytes; input e output não compartilham o Buffer do cache',()=>{
  const {c,request,get}=setup(),value=Buffer.from('answer');c.commit(c.begin(request()),value);value.fill(0);
  const answer=get();assert.equal(answer.toString(),'answer');answer.fill(0);assert.equal(get().toString(),'answer');
});
test('miss não cria entrada; cancelamento libera ticket sem executar nenhum efeito',()=>{
  const {c,request}=setup(),t=c.begin(request());assert.equal(c.lookup(t),null);assert(c.cancel(t));assert(!c.cancel(t));assert.equal(c.stats().entries,0);
});
test('não há compartilhamento de entrada entre principals sem mesmo escopo',()=>{
  const {c,put,get}=setup();put();c.setGrant('P','bob',true,0);assert.equal(get({principal:'bob'}),null);
  assert.equal(get().toString(),'answer');
});
test('ausência ou recusa do grant não é um miss de cache autorizado',()=>{
  const {c,request}=setup();throws(()=>c.begin(request({principal:'bob'})),'NOT_AUTHORIZED');c.setGrant('P','alice',false,1);throws(()=>c.begin(request()),'NOT_AUTHORIZED');
});
test('revogação depois de begin recusa commit e lookup pendentes',()=>{
  const {c,request,put}=setup();put();const a=c.begin(request()),b=c.begin(request());c.setGrant('P','alice',false,1);
  throws(()=>c.commit(a,'stale'),'AUTHORIZATION_CHANGED');throws(()=>c.lookup(b),'AUTHORIZATION_CHANGED');assert.equal(c.stats().entries,0);
});
test('reaprovação não ressuscita ticket capturado antes da revogação',()=>{
  const {c,request}=setup(),t=c.begin(request());c.setGrant('P','alice',false,1);c.setGrant('P','alice',true,2);
  throws(()=>c.commit(t,'old'),'AUTHORIZATION_CHANGED');assert(c.commit(c.begin(request()),'new').stored);
});
test('revogação após entrega não apaga bytes já copiados ao consumidor',()=>{
  const {c,put,get}=setup();put();const delivered=get();c.setGrant('P','alice',false,1);assert.equal(delivered.toString(),'answer');assert.equal(c.stats().entries,0);
});
test('mudança durante await é detectada antes da publicação',async()=>{
  const {c,request,update}=setup(),t=c.begin(request());await Promise.resolve();update('content/a','new');
  throws(()=>c.commit(t,'outdated'),'DEPENDENCY_CHANGED');assert.equal(c.stats().entries,0);
});
test('update invalida apenas entradas dependentes; demais artefatos sobrevivem',()=>{
  const {put,get,update,c}=setup();put('A');put('B',{dependencies:['policy/context','content/b']});update('content/a','a-new');
  assert.equal(get(),null);assert.equal(get({dependencies:['policy/context','content/b']}).toString(),'B');assert.equal(c.stats().invalidated,1);
});
test('mesmo hash é early cutoff mas versão esperada continua obrigatória',()=>{
  const {put,get,update,c}=setup();put();const out=update('content/a','content/a=1');assert.equal(out.changed,false);assert.equal(out.version,1);assert.equal(get().toString(),'answer');
  throws(()=>c.updateResources('P',[{name:'content/a',digest:digest('content/a=1'),expectedVersion:0}]),'RESOURCE_CONFLICT');
});
test('lote conflitante não modifica recursos anteriores no lote',()=>{
  const {c,put,get}=setup();put();throws(()=>c.updateResources('P',[{name:'content/a',digest:digest('new'),expectedVersion:1},{name:'content/b',digest:digest('new'),expectedVersion:0}]),'RESOURCE_CONFLICT');assert.equal(get().toString(),'answer');
});
test('dependência removida é indisponível; recriação mantém revisão crescente',()=>{
  const {c,request,put,update}=setup();put();const ticket=c.begin(request());assert.equal(update('content/a',null).version,2);
  throws(()=>c.begin(request()),'DEPENDENCY_UNAVAILABLE');assert.equal(update('content/a','content/a=1').version,3);throws(()=>c.commit(ticket,'old'),'DEPENDENCY_CHANGED');
});
test('search exige geração do índice mesmo quando um único documento foi selecionado',()=>{
  const {c,request}=setup();throws(()=>c.begin(request({kind:'search'})),'MISSING_REQUIRED_DEPENDENCY');
});
test('arquivo novo invalida search pela coleção sem alterar o antigo resultado',()=>{
  const {put,get,update}=setup(),r={kind:'search',dependencies:['policy/context','content/a','index/generation']};
  put('resultado-a',r);update('content/b','novo concorrente relevante');update('index/generation','novo índice incluindo b');assert.equal(get(r),null);
});
test('context exige tarefa, memória e índice; decision exige modelo e calibração',()=>{
  const {c,request}=setup();throws(()=>c.begin(request({kind:'context',dependencies:['policy/context','index/generation','memory/revision']})),'MISSING_TASK_DEPENDENCY');
  throws(()=>c.begin(request({kind:'decision',dependencies:['policy/context','model/revision','state/s']})),'MISSING_REQUIRED_DEPENDENCY');
  for(const [kind,dependencies] of [['context',['policy/context','index/generation','memory/revision','task/t']],['decision',['policy/context','model/revision','calibration/revision','state/s']]]){
    const t=c.begin(request({kind,dependencies}));assert(c.commit(t,'typed-result').stored);
  }
});
test('autorização, mutation, execução de teste e recibos não são classes reutilizáveis',()=>{
  const {c,request}=setup();for(const kind of ['authorization','mutation','test-execution','usage-receipt'])throws(()=>c.begin(request({kind})),'NON_REUSABLE_OPERATION');
});
test('mudar query ou configuração completa não reaproveita a entrada',()=>{
  const {put,get}=setup();put();assert.equal(get({queryHash:digest('q2')}),null);assert.equal(get({contractHash:digest('model/version/2')}),null);
});
test('nomes de dependências são ordem canônica; argumentos opacos preservam sua ordem por hash',()=>{
  const {put,get}=setup();put();assert.equal(get({dependencies:['content/a','policy/context']}).toString(),'answer');
  assert.notEqual(digest(JSON.stringify(['A','B'])),digest(JSON.stringify(['B','A'])));
});
test('ticket é opaco, local à instância e não pode ser publicado duas vezes',()=>{
  const a=setup(),b=setup(),t=a.c.begin(a.request());throws(()=>b.c.commit(t,'bad'),'UNKNOWN_TICKET');a.c.commit(t,'ok');throws(()=>a.c.commit(t,'again'),'UNKNOWN_TICKET');
  throws(()=>a.c.lookup(Object.freeze({})),'UNKNOWN_TICKET');
});
test('mutar o array do chamador depois de begin não muda dependências capturadas',()=>{
  const {c,request,update}=setup(),r=request(),t=c.begin(r);r.dependencies[1]='content/b';update('content/a','new');throws(()=>c.commit(t,'bad'),'DEPENDENCY_CHANGED');
});
test('TTL absoluto não é prorrogado por hits frequentes',()=>{
  const {put,get,time}=setup({ttlMs:100});put();time(90);assert.equal(get().toString(),'answer');time(100);assert.equal(get(),null);
});
test('ticket possui prazo independente do TTL do objeto',()=>{
  const {c,request,time}=setup({ticketTtlMs:10}),t=c.begin(request());time(10);throws(()=>c.commit(t,'late'),'TICKET_EXPIRED');
});
test('LRU global é limitado sem reciclar payloads ainda usados pelo chamador',()=>{
  const {put,get,c}=setup({maxEntries:2,maxScopeEntries:2});put('A');put('B',{queryHash:digest('B')});const external=get();put('C',{queryHash:digest('C')});
  assert.equal(get({queryHash:digest('B')}),null);assert.equal(external.toString(),'A');assert.equal(c.stats().entries,2);assert.equal(c.stats().evicted,1);
});
test('cota por escopo expulsa primeiro o próprio escopo',()=>{
  const {c,request,put,get}=setup({maxEntries:4,maxScopeEntries:1});c.setGrant('P','bob',true,0);c.commit(c.begin(request({principal:'bob'})),'BOB');
  put('A');put('A2',{queryHash:digest('A2')});assert.equal(get({principal:'bob'}).toString(),'BOB');assert.equal(get(),null);assert.equal(c.stats().entries,2);
});
test('entrada grande é recusada antes de ser mantida; ticket é consumido',()=>{
  const {c,request}=setup({maxEntryBytes:8}),t=c.begin(request());throws(()=>c.commit(t,'123456789'),'ENTRY_TOO_LARGE');assert.equal(c.stats().entries,0);assert.equal(c.stats().tickets,0);
});
test('quota de bytes contabilizados limita retenção; não é teto de RSS',()=>{
  const {put,c}=setup({maxBytes:2048,maxScopeBytes:2048});for(let i=0;i<10;i++)put('x'.repeat(200),{queryHash:digest(String(i))});assert(c.stats().accountedBytes<=2048);assert(c.stats().evicted>0);assert.equal(c.stats().hardRssLimit,false);
});
test('limite de tickets é finito e tickets expirados liberam admissão',()=>{
  const {c,request,time}=setup({maxTickets:1,ticketTtlMs:10});c.begin(request());throws(()=>c.begin(request()),'TICKET_LIMIT');time(10);assert(c.begin(request()));
});
test('resultados distintos para a mesma identidade invalidam o cache',()=>{
  const {c,request,get}=setup(),a=c.begin(request()),b=c.begin(request());c.commit(a,'A');throws(()=>c.commit(b,'B'),'INCONSISTENT_RESULT');assert.equal(get(),null);
});
test('commit duplicado de bytes iguais não renova TTL',()=>{
  const {c,request,get,time}=setup({ttlMs:100}),a=c.begin(request()),b=c.begin(request());c.commit(a,'A');time(50);assert(c.commit(b,'A').duplicate);time(100);assert.equal(get(),null);
});
test('relógio regressivo falha fechado e exige nova instância',()=>{
  const {put,c,request,time}=setup();time(10);put();time(9);throws(()=>c.begin(request()),'CLOCK_FAULT');time(20);throws(()=>c.begin(request()),'CLOCK_FAULT');assert.equal(c.stats().entries,0);
});
test('entradas malformadas, dependências desconhecidas e campos livres são recusados',()=>{
  const {c,request}=setup();throws(()=>c.begin(request({prompt:'private'})),'INVALID_REQUEST');throws(()=>c.begin(request({queryHash:'bad'})),'INVALID_IDENTITY');
  throws(()=>c.begin(request({dependencies:['policy/context','content/missing']})),'DEPENDENCY_UNAVAILABLE');
  throws(()=>c.begin(request({dependencies:['policy/context','content/a','content/a']})),'DUPLICATE_DEPENDENCY');
  throws(()=>new WitnessCache({unknown:1}),'UNKNOWN_LIMIT');throws(()=>new WitnessCache({ttlMs:Infinity}),'INVALID_LIMIT');
});
test('atualização de outro projeto não invalida nem autoriza o projeto atual',()=>{
  const {c,put,get}=setup();put();c.setGrant('Q','alice',true,0);c.updateResources('Q',[{name:'content/a',digest:digest('q'),expectedVersion:0}]);assert.equal(get().toString(),'answer');
});
test('clear remove entradas, tickets e índices reversos sem apagar estado do host',()=>{
  const {c,request,put}=setup();put();c.begin(request());c.clear();const s=c.stats();assert.equal(s.entries,0);assert.equal(s.tickets,0);assert.equal(s.reverseEdges,0);assert(s.resources>0);assert(c.begin(request()));
});

test('1.296 sequências de quatro eventos preservam igualdade com função determinística fria',()=>{
  // Estado controlado, não produção nem modelo neural. A função fria é o oráculo independente.
  const actions=['a0','a1','b0','b1','read-a','read-b'];let sequences=0,reads=0;
  for(let code=0;code<6**4;code++){
    const f=setup(),state={a:'content/a=1',b:'content/b=1'};let seq=code;
    for(let step=0;step<4;step++){
      const op=actions[seq%6];seq=Math.floor(seq/6);
      if(op.startsWith('read-')){
        const name=op.at(-1),r=f.request({queryHash:digest(name),dependencies:['policy/context','content/'+name]}),t=f.c.begin(r);
        const cached=f.c.lookup(t),cold=Buffer.from('parsed:'+state[name]);
        if(cached===null)f.c.commit(t,cold);else assert.deepEqual(cached,cold);
        reads++;
      }else{const name=op[0];state[name]=op;f.update('content/'+name,op);}
    }
    sequences++;
  }
  assert.equal(sequences,1296);assert.equal(reads,1728);
});
