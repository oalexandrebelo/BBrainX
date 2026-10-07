'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const nf = new Intl.NumberFormat('pt-BR', {maximumFractionDigits:0});
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const number = n => Number.isSafeInteger(n) ? nf.format(n) : '—';
  const pct = n => finite(n) ? new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(n)+'%' : '—';
  const put = (id,text) => {$(id).textContent=String(text);};
  const make = (tag,text,cls) => {const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;};
  let current=null, active=null, generation=0;
  function error(message){$('error').hidden=!message;put('error',message||'');}
  function money(m){const n=Number(m.amount);if(finite(n)&&n>0&&n<0.000001)return m.currency+' <0,000001';return m.currency+' '+(finite(n)&&Math.abs(n)<1e12?new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:6}).format(n):m.amount);}
  function validate(v){
    const fail=()=>{throw new Error('Relatório incompatível. Exporte pelo comando usage report desta versão.');};
    const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
    const bounded=n=>Number.isSafeInteger(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER;
    const natural=n=>bounded(n)&&n>=0, nullable=n=>n===null||natural(n);
    const label=(x,n=160)=>typeof x==='string'&&x.length>0&&x.length<=n;
    const dec=x=>typeof x==='string'&&/^-?\d{1,25}(\.\d{1,12})?$/.test(x);
    const ratio=x=>x===null||(finite(x)&&x>=0&&x<=1);
    if(!obj(v)||v.schemaVersion!==1||!label(v.project,80)||!obj(v.context)||!obj(v.usage)||!obj(v.usage.tokens))fail();
    const c=v.context,u=v.usage;
    for(const [array,limit] of [[u.groups,100],[u.pairs,100],[u.money,40]])if(!Array.isArray(array)||array.length>limit)fail();
    for(const k of ['inputTotal','inputUncached','cacheRead','cacheWrite','outputTotal','outputReasoning','totalTokens']){
      const t=u.tokens[k];if(!obj(t)||!nullable(t.value)||!natural(t.knownCalls)||!natural(t.unknownCalls)||typeof t.complete!=='boolean')fail();
    }
    for(const k of ['packs','knownPairs','unknownPairs'])if(!natural(c[k]))fail();
    for(const k of ['payloadTokens','referenceTokens','pairedPayloadTokens'])if(!nullable(c[k]))fail();
    if(c.reducedTokens!==null&&!bounded(c.reducedTokens))fail();
    if(c.reductionPercent!==null&&!finite(c.reductionPercent))fail();
    if(!obj(u.cache)||!natural(u.importedCalls)||!natural(u.cache.coveredCalls)||!ratio(u.cache.ratio))fail();
    for(const m of u.money)if(!obj(m)||!/^([A-Z]{3})$/.test(m.currency)||!['reported','estimated'].includes(m.basis)||!dec(m.amount)||!natural(m.calls))fail();
    for(const g of u.groups)if(!obj(g)||![g.model,g.provider,g.harness].every(x=>label(x))||![g.calls,g.totalTokens,g.unknownTokens].every(natural))fail();
    for(const p of u.pairs){
      if(!obj(p)||!label(p.id)||typeof p.comparable!=='boolean'||!Array.isArray(p.reasons)||p.reasons.length>20||!p.reasons.every(x=>label(x)))fail();
      if(p.savedTokens!==null&&!bounded(p.savedTokens))fail();
      if(p.savingsPercent!==null&&!finite(p.savingsPercent))fail();
      if(!Array.isArray(p.money)||p.money.length>2)fail();
      for(const m of p.money)if(!obj(m)||!['reported','estimated'].includes(m.basis)||!/^([A-Z]{3})$/.test(m.currency)||!dec(m.difference))fail();
    }
    return v;
  }
  function render(report,imported=false){
    current=validate(report);$('export').disabled=false;
    const c=report.context,u=report.usage;
    put('total',number(u.tokens.totalTokens.value));put('cached',number(u.tokens.cacheRead.value));put('reduced',number(c.reducedTokens));
    put('total-note',u.importedCalls?`${u.tokens.totalTokens.knownCalls} de ${u.importedCalls} recibos com total conhecido`:'Nenhum recibo de usage final');
    put('cache-note',u.cache.coveredCalls?`${pct(u.cache.ratio===null?null:u.cache.ratio*100)} da entrada coberta · não gratuito`:'Cache não informado pelo provedor');
    put('reduction-note',c.knownPairs?`${c.knownPairs} pacotes com referência · não é billing`:'Sem referência local comparável');
    const reported=u.money.filter(m=>m.basis==='reported');
    put('cost',reported.length===1?money(reported[0]):reported.length?reported.length+' moedas':'—');
    put('cost-note',reported.length===1?`${reported[0].calls} de ${u.importedCalls} recibos com custo · importado`:'Moedas e estimativas nunca são somadas entre si');
    put('pack-count',`${number(c.packs)} pacotes locais`);put('receipt-count',`${number(u.importedCalls)} recibos`);
    put('before-tokens',number(c.referenceTokens));put('after-tokens',number(c.pairedPayloadTokens));put('local-percent',pct(c.reductionPercent));
    const maximum=Math.max(c.referenceTokens||0,c.pairedPayloadTokens||0);
    $('before-bar').style.width=maximum?100*c.referenceTokens/maximum+'%':'0';$('after-bar').style.width=maximum?100*c.pairedPayloadTokens/maximum+'%':'0';
    $('measurement-help').hidden=c.knownPairs>0;
    const buckets=[['inputUncached','Entrada sem cache','#c1cdd5'],['cacheRead','Leitura de cache','#178564'],['cacheWrite','Escrita de cache','#89bcb0'],['outputTotal','Saída (inclui raciocínio)','#6489c5']];
    const complete=buckets.every(([key])=>u.tokens[key].complete);
    const total=complete?buckets.reduce((sum,[key])=>sum+u.tokens[key].value,0):0;
    $('buckets').replaceChildren();$('composition').replaceChildren();
    for(const [key,label,color] of buckets){
      const row=make('div',undefined,'bucket'),dot=make('i');dot.style.background=color;row.append(dot,make('span',label),make('strong',number(u.tokens[key].value)));$('buckets').append(row);
      if(total>0){const seg=make('div',undefined,'segment');seg.style.background=color;seg.style.width=100*u.tokens[key].value/total+'%';seg.title=label+': '+number(u.tokens[key].value);$('composition').append(seg);}
    }
    $('composition').setAttribute('aria-label',complete?'Distribuição dos tokens nos recibos completos':'Composição indisponível: existem parcelas não observadas');
    put('coverage',u.importedCalls?`${u.cache.coveredCalls} recibos com entrada/cache comparáveis. Chamadas fora da instrumentação: desconhecidas.`:'Cobertura do consumo total da estação: desconhecida.');
    put('money-details',u.money.length?u.money.map(m=>(m.basis==='reported'?'Informado: ':'Estimado (tokens): ')+money(m)+' · '+m.calls+' recibos').join(' | '):'Sem tabela de preços ou custos importados.');
    $('models').replaceChildren();
    if(!u.groups.length){const tr=make('tr'),td=make('td','Sem chamadas instrumentadas ou importadas.','empty-cell');td.colSpan=3;tr.append(td);$('models').append(tr);}
    for(const g of u.groups){const tr=make('tr'),name=make('td',g.model);name.append(make('small',g.provider+' · '+g.harness));tr.append(name,make('td',number(g.calls)),make('td',number(g.totalTokens)+(g.unknownTokens?' + ?':'')));$('models').append(tr);}
    $('pairs').replaceChildren();
    if(!u.pairs.length){const e=make('div',undefined,'empty');e.append(make('span','↔'),make('h3','Ainda não existe um par comparável.'),make('p','Duas execuções, identidade compatível, recibos e aceitação são necessários. Não atribuímos redução local ao custo de uma tarefa.'));$('pairs').append(e);}
    for(const p of u.pairs){
      const e=make('article',undefined,'pair'+(p.savedTokens<0?' bad':''));e.append(make('h3',p.id));
      if(p.comparable){e.append(make('strong',number(p.savedTokens)),make('p','tokens de diferença: baseline − candidato ('+pct(p.savingsPercent)+')'),make('p','Par declarado aceito; não é prova causal ou completude autenticada.'));for(const m of p.money||[])e.append(make('p',`${m.basis==='reported'?'Custo informado':'Estimativa token-only'}: ${m.currency} ${m.difference} (baseline − candidato)`));}
      else e.append(make('p','Não comparável: '+(Array.isArray(p.reasons)?p.reasons.join(', '):'verificação pendente')));
      $('pairs').append(e);
    }
    const partial=c.truncated||u.truncated||u.pairsTruncated||u.groupsTruncated||u.moneyTruncated;
    put('source-note',(imported?'Relatório aberto localmente; origem e completude não autenticadas. ':'Dados locais + recibos importados explicitamente. ')+(report.project==='demo'||report.project==='synthetic-receipts'?'Corpus de demonstração; não é benchmark de tarefas reais. ':'')+(partial?'Janela limitada: estes totais são parciais.':'Nenhuma chamada a provedor é feita por este painel.'));
    const date=new Date(report.generatedAt);put('asof','Atualizado '+(Number.isNaN(date.valueOf())?'em instante não informado':date.toLocaleString('pt-BR')));
  }
  async function refresh(){
    const id=$('project').value;if(!id)return;
    active?.abort();active=new AbortController();const version=++generation;error('');$('refresh').disabled=true;$('export').disabled=true;document.querySelectorAll('.metrics,.grid-main').forEach(e=>e.setAttribute('aria-busy','true'));put('source-note','Carregando o projeto '+id+'. A visão anterior fica suspensa até a leitura terminar.');
    try{
      const res=await fetch('/api/usage?project='+encodeURIComponent(id),{signal:active.signal,cache:'no-store'});
      const json=await res.json();if(!res.ok)throw new Error(json.error||'Falha na leitura');if(version===generation)render(json);
    }catch(e){if(e.name!=='AbortError'&&version===generation)error(e.message);}
    finally{if(version===generation){$('refresh').disabled=false;document.querySelectorAll('.metrics,.grid-main').forEach(e=>e.removeAttribute('aria-busy'));if(current?.project!==id){put('source-note','Não foi possível carregar o projeto selecionado. Os números anteriores não pertencem a esta seleção.');}else $('export').disabled=false;}}
  }
  $('project').addEventListener('change',refresh);$('refresh').addEventListener('click',refresh);
  $('export').addEventListener('click',()=>{
    if(!current)return;const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=make('a');
    a.href=url;a.download='bbrainx-observatory-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('open-report').addEventListener('click',()=>$('report-file').click());
  $('report-file').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    try{if(file.size>2*1024*1024)throw new Error('Relatório excede 2 MiB.');const parsed=validate(JSON.parse(await file.text()));active?.abort();++generation;$('refresh').disabled=true;const option=make('option',parsed.project);option.value=parsed.project;$('project').replaceChildren(option);render(parsed,true);error('');}
    catch(e){error(e.message);}
  });
  async function boot(){
    if(location.protocol==='file:'){put('source-note','Visualizador offline. Abra um JSON exportado pelo BBrainX; nenhum arquivo é enviado à rede.');return;}
    try{const res=await fetch('/api/bootstrap',{cache:'no-store'});if(!res.ok)throw new Error('Inicie o painel local do BBrainX para conectar dados.');const data=await res.json();
      if(!Array.isArray(data.projects)||data.projects.length>10000)throw new Error('Catálogo de projetos inválido.');
      if(!data.projects.length){put('source-note','Nenhum projeto registrado. Execute bbrainx up no projeto desejado ou abra um relatório local.');return;}
      $('project').replaceChildren(...data.projects.map(p=>{const o=make('option',p.id);o.value=p.id;return o;}));await refresh();
    }catch(e){error(e.message);put('source-note','Sem dados locais conectados. Também é possível abrir um relatório exportado.');}
  }
  boot();
})();
