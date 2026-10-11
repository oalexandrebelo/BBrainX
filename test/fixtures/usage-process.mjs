import {UsageStore} from '../../src/usage/store.mjs';import {call} from './usage-fixtures.mjs';
const s=new UsageStore(process.argv[2]);try{console.log(JSON.stringify(s.import('A',[{expectedVersion:0,call:call()}])));}finally{s.close();}
