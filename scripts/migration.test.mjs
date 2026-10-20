import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {buildBackend,buildFrontend,root} from './build.mjs';
buildBackend();
const {default:worker}=await import('../backend/generated/worker.mjs');
const {verifyAdmin}=await import('../backend/gateway.mjs');
const frontend='https://cliozhu0810-design.github.io', backend='https://tomespot-api.example.workers.dev';
const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(root,'backend/schema.sql'),'utf8'));
const DB={prepare(sql){let values=[];const q={bind(...v){values=v;return q;},async all(){return {results:db.prepare(sql).all(...values)};},async first(){return db.prepare(sql).get(...values)||null;},async run(){return db.prepare(sql).run(...values);}};return q;}};
const objects=new Map();
const BUCKET={async put(k,v,opts){objects.set(k,{body:v,httpMetadata:opts.httpMetadata});},async get(k){return objects.get(k);},async delete(k){objects.delete(k);}};
const env={DB,BUCKET,FRONTEND_ORIGIN:frontend,ADMIN_EMAIL:'owner@example.com',ACCESS_TEAM_DOMAIN:'https://tomespot-test.cloudflareaccess.com',ACCESS_AUD:'test-audience',COMMENT_HASH_SALT:'local-test-only-salt',ASSETS:{fetch:async()=>new Response('asset')}};
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'test-key'};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,...rest)=>String(url)===env.ACCESS_TEAM_DOMAIN+'/cdn-cgi/access/certs'?Response.json({keys:[jwk]}):originalFetch(url,...rest);
async function token(overrides={}) {
  const now=Math.floor(Date.now()/1000),encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned=encode({alg:'RS256',kid:'test-key'})+'.'+encode({iss:env.ACCESS_TEAM_DOMAIN,type:'app',aud:[env.ACCESS_AUD],sub:'owner-id',email:env.ADMIN_EMAIL,iat:now,nbf:now-1,exp:now+3600,...overrides});
  return unsigned+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(unsigned))).toString('base64url');
}
const facility=JSON.parse(fs.readFileSync(path.join(root,'source/public/parking.json'))).places[0].id;
const call=(p,options={})=>worker.fetch(new Request(backend+p,options),env);
test('rejects forged identity, wrong JWT signature, audience, email and expired JWT',async()=>{
  assert.equal((await call('/api/admin/comments',{headers:{'oai-authenticated-user-id':'fake','oai-authenticated-user-email':env.ADMIN_EMAIL}})).status,403);
  for(const claims of [{aud:['wrong']},{email:'other@example.com'},{exp:1},{iss:'https://other.cloudflareaccess.com'}]) assert.equal(await verifyAdmin(new Request(backend,{headers:{'Cf-Access-Jwt-Assertion':await token(claims)}}),env),null);
  const signed=await token(),parts=signed.split('.');parts[2]=Buffer.alloc(256).toString('base64url');
  assert.equal(await verifyAdmin(new Request(backend,{headers:{'Cf-Access-Jwt-Assertion':parts.join('.')}}),env),null);
  assert.equal((await call('/api/admin/session',{headers:{'Cf-Access-Jwt-Assertion':signed}})).status,200);
});
test('CORS allows configured frontend and rejects unrelated submission origins',async()=>{
  const allowed=await call('/api/comments',{method:'OPTIONS',headers:{Origin:frontend,'Access-Control-Request-Method':'POST'}});
  assert.equal(allowed.status,204);assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),frontend);
  assert.equal((await call('/api/comments',{method:'OPTIONS',headers:{Origin:'https://evil.example','Access-Control-Request-Method':'POST'}})).status,403);
  assert.equal((await call('/api/comments',{method:'POST',headers:{Origin:'https://evil.example'}})).status,403);
});
test('anonymous comment/photo stays private, moderator can approve it, public can then read it',async()=>{
  const id=crypto.randomUUID(),data=new FormData();
  for(const [k,v] of Object.entries({id,facility,vehicle:'bicycle',body:'Local migration test'}))data.set(k,v);
  data.set('photos',new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0])],{type:'image/png'}),'photo.png');
  const submit=()=>call('/api/comments',{method:'POST',headers:{Origin:frontend,'cf-connecting-ip':'192.0.2.1'},body:data});
  assert.equal((await submit()).status,201);assert.equal((await submit()).status,200);
  assert.equal((await (await call('/api/comments?facility='+facility)).json()).comments.length,0);
  assert.equal((await call('/api/photos/'+id+'?index=0')).status,404);
  const auth={'Cf-Access-Jwt-Assertion':await token()};
  assert.equal((await call('/api/photos/'+id+'?index=0',{headers:auth})).status,200);
  assert.equal((await call('/api/admin/comments/'+id,{method:'PATCH',headers:{...auth,Origin:backend,'Content-Type':'application/json'},body:JSON.stringify({status:'approved',note:'checked'})})).status,200);
  const published=(await (await call('/api/comments?facility='+facility)).json()).comments;
  assert.equal(published.length,1);assert.equal(published[0].body,'Local migration test');assert.equal(published[0].adminNote,undefined);
  assert.equal((await call(published[0].photos[0])).status,200);
  assert.equal((await call('/api/photos/'+id+'?index=3')).status,404);
});
test('rate limit remains in place after migration',async()=>{
  for(let i=0;i<6;i++) {
    const data=new FormData();for(const [k,v] of Object.entries({id:crypto.randomUUID(),facility,vehicle:'bicycle',body:'Test '+i}))data.set(k,v);
    const response=await call('/api/comments',{method:'POST',headers:{Origin:frontend,'cf-connecting-ip':'192.0.2.20'},body:data});
    assert.equal(response.status,i<5?201:429);
  }
});
test('static build preserves data and all local HTML links resolve on Pages',()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'tomespot-migration-'));
  try {
    buildFrontend({apiBase:backend,output:out});
    const index=fs.readFileSync(path.join(out,'index.html'),'utf8');
    assert.match(index,/config\.js/);assert.match(index,/href="https:\/\/tomespot-api\.example\.workers\.dev\/admin"/);
    assert.equal(fs.readdirSync(path.join(out,'parking')).length,1433);
    assert.equal(fs.readFileSync(path.join(out,'parking.json'),'utf8'),fs.readFileSync(path.join(root,'source/public/parking.json'),'utf8'));
    const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]);
    for(const file of walk(out)) {
      if(file.endsWith('.js')) new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
      if(!file.endsWith('.html'))continue;
      const html=fs.readFileSync(file,'utf8');assert.ok(!html.includes('tomespot-test.nuttymink33.chatgpt.site'));
      for(const [,href] of html.matchAll(/(?:href|src)="([^"\s]+)"/g)) {
        if(/^(?:https?:|data:|blob:|mailto:|tel:|#|\/\/)/.test(href))continue;
        const url=new URL(href,new URL(path.relative(out,file).replaceAll('\\','/'),frontend+'/'));
        const local=decodeURIComponent(url.pathname);
        assert.ok(fs.existsSync(path.join(out,local==='/'?'index.html':local)),file+' missing '+local);
      }
    }
    assert.ok(!fs.existsSync(path.join(out,'admin.js')));
    assert.ok(!fs.existsSync(path.join(out,'batch-09-review.html')));
    assert.ok(!fs.readFileSync(path.join(out,'sitemap.xml'),'utf8').includes('<loc>'+frontend+'/parking/kanagawa-no-such-place'));
    const sitemap=fs.readFileSync(path.join(out,'sitemap.xml'),'utf8');
    assert.ok(!sitemap.includes('.html</loc>'));
    const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
    assert.equal(new Set(urls).size,1438);
    for(const url of urls){
      assert.equal(new URL(url).origin,'https://muko-tomespot.pages.dev');
      const p=new URL(url).pathname;
      const file=p==='/'?'index.html':p.slice(1)+'.html';
      assert.ok(fs.existsSync(path.join(out,file)),url+' has no output');
      assert.ok(fs.readFileSync(path.join(out,file),'utf8').includes('rel="canonical" href="'+url+'"'),url+' canonical differs');
    }
    for(const [file,term] of [['kickboard-parking.html','キックボード駐車場'],['bicycle-parking.html','自転車駐輪場'],['motorcycle-parking.html','バイク駐輪場']]){
      const page=fs.readFileSync(path.join(out,file),'utf8');
      assert.ok(page.includes(term));
      for(const [,data]of page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))JSON.parse(data);
    }
  } finally {fs.rmSync(out,{recursive:true,force:true});}
});
