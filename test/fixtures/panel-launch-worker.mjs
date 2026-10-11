// Processo real do lifecycle, build mínimo de teste explicitamente escolhido pelo host.
import {ensurePanel} from '../../src/panel/lifecycle.mjs';
const handle=await ensurePanel(process.argv[2],{home:process.argv[3],assetsDir:process.argv[4]});
console.log(JSON.stringify({owned:handle.owned,status:handle.status}));
if(handle.owned)await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});
await handle.close();
