/** Máquina de lifecycle independente do editor. probe/start são ports do host; nenhum shell/polling idle. */
function createPanelController({probe,start,alive,delay=ms=>new Promise(r=>setTimeout(r,ms)),clock=()=>performance.now(),timeoutMs=10000}) {
  let pending=null,terminal=null,disposed=false;
  function ensure(url) {
    if(pending){if(pending.url!==url)return Promise.reject(new Error('PANEL_CONFIGURATION_CHANGED'));return pending.work;}
    const work=(async()=>{
      if(disposed)throw new Error('PANEL_DISPOSED');
      let report=await probe(url);if(disposed)throw new Error('PANEL_DISPOSED');
      if(report.state==='ready'||report.state!=='unreachable')return report;
      const normalized=report.normalized===true;
      // Terminal vivo porém sem listener: não criar outro às cegas. Esperar startup limitado.
      if(!terminal||!alive(terminal)){terminal=await start(report.url);if(disposed){terminal?.dispose?.();throw new Error('PANEL_DISPOSED');}};
      const until=clock()+timeoutMs;
      while(clock()<until&&!disposed){
        await delay(200);report={...await probe(report.url),normalized};
        if(disposed)throw new Error('PANEL_DISPOSED');
        if(report.state==='ready'||report.state!=='unreachable')return report;
        if(!alive(terminal))return {...report,state:'process-exited'};
      }
      return {...report,state:disposed?'disposed':'startup-timeout'};
    })();
    pending={url,work};void work.then(()=>{pending=null;},()=>{pending=null;});return work;
  }
  return {ensure,closed(t){if(terminal===t)terminal=null;},dispose(){disposed=true;terminal?.dispose?.();}};
}
module.exports={createPanelController};
