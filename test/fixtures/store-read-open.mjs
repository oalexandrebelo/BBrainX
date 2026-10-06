import {BrainStore} from '../../src/store.mjs';
process.send?.({ready:true});
process.once('message',({home})=>{
  let store;
  try { store=new BrainStore(home); process.send?.({opened:true,projects:store.projects().length}); }
  catch(error) { process.send?.({opened:false,error:error.code??error.message}); }
  finally { store?.close(); process.disconnect?.(); }
});
