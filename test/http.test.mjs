import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import { BrainStore } from '../src/store.mjs';import { startServer } from '../src/server.mjs';

function rawStatus(url,headers){return new Promise((resolve,reject)=>{const req=http.request(url,{headers},res=>{res.resume();resolve(res.statusCode);});req.once('error',reject);req.end();});}
test('HTTP loopback host, origin and CSRF boundaries',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-http-'));const store=new BrainStore(home);const server=await startServer(store,{port:0});
 try{
  const bootstrap=await fetch(server.url+'/api/bootstrap');assert.equal(bootstrap.status,200);const data=await bootstrap.json();assert.equal(data.csrf.length,64);
  const badOrigin=await fetch(server.url+'/api/bootstrap',{headers:{origin:'https://evil.example'}});assert.equal(badOrigin.status,403);
  // fetch normaliza Host em algumas versões; teste o header literal pelo cliente HTTP nativo.
  assert.equal(await rawStatus(server.url+'/api/bootstrap',{host:'evil.example'}),403);
  assert.equal(await rawStatus(server.url+'/api/bootstrap',{'sec-fetch-site':'cross-site'}),403);
  const post=await fetch(server.url+'/api/invoke',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(post.status,403);
  assert.match(bootstrap.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 }finally{await server.close();store.close();fs.rmSync(home,{recursive:true,force:true});}
});
