import {LaneStore} from '../../src/lanes/store.mjs';import {indexProject} from '../../src/retrieval.mjs';
const [home,lane]=process.argv.slice(2),store=new LaneStore(home,'product',lane);
try{
  store.beginOperation();indexProject(store,'product');
  const checkpoint=store.checkpoint('product','TASK',{objective:lane,nextAction:'review',status:'review_needed'},0,'same-key');
  const p=store.proposeMemory('product','shared proposal from '+lane,'fixture:'+lane);
  console.log(JSON.stringify({checkpoint,memoryId:p.id}));
}finally{store.close();}
