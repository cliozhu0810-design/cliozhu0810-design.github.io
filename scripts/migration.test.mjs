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
    assert.ok(!index.includes('class="side-footer"'));
    assert.ok(!index.includes('class="edition"'));
    assert.ok(!index.includes('class="search-about"'));
    assert.match(index,/href="\/about.html"/);
    assert.match(index,/name="google-site-verification"/);
    assert.match(index,/config\.js/);assert.match(index,/href="https:\/\/tomespot-api\.example\.workers\.dev\/admin"/);
    assert.equal(fs.readdirSync(path.join(out,'parking')).length,1494);
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
    assert.equal(new Set(urls).size,1501);
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
test('map regions identify prefectures locally and do not infer another region for the sea',()=>{
  const app=fs.readFileSync(path.join(root,'source/public/app.js'),'utf8');
  const context=vm.createContext({localStorage:{getItem:()=>null},document:{getElementById:()=>null}});
  vm.runInContext(app.slice(0,app.indexOf("$('search').addEventListener")),context);
  const regions=JSON.parse(fs.readFileSync(path.join(root,'source/public/prefectures.json'),'utf8')).prefectures;
  assert.equal(regions.length,47);context.regions=regions;
  vm.runInContext('prefectureRegions=regions',context);
  for(const [lat,lng,name]of [[35.6895,139.6917,'東京都'],[35.4437,139.638,'神奈川県'],[35.8617,139.6455,'埼玉県'],[43.0618,141.3545,'北海道'],[26.2124,127.6809,'沖縄県'],[34.6937,135.5023,'大阪府'],[0,0,'']]){
    assert.equal(vm.runInContext(`prefectureAt({lat:${lat},lng:${lng}})`,context),name);
  }
  assert.match(app,/on\('moveend',updateMapRegion\)/);
  const heading={hidden:false,toggleAttribute(name,enabled){this.ready=enabled;}};
  const label={textContent:'',closest:()=>heading};
  context.document.getElementById=()=>label;
  context.mapCenter={lat:35.6895,lng:139.6917};
  vm.runInContext('state.map={getCenter:()=>mapCenter};updateMapRegion()',context);
  assert.equal(label.textContent,'東京都');assert.equal(heading.hidden,false);assert.equal(heading.ready,true);
  context.mapCenter={lat:0,lng:0};
  vm.runInContext('updateMapRegion()',context);
  assert.equal(label.textContent,'');assert.equal(heading.hidden,true);assert.equal(heading.ready,false);
});

test('Maps trial keeps disputed addresses and separates bicycle, motorcycle and scooter evidence',()=>{
  const parking=JSON.parse(fs.readFileSync(path.join(root,'source/public/parking.json'),'utf8'));
  const vehicles=JSON.parse(fs.readFileSync(path.join(root,'source/public/vehicle-data.json'),'utf8'));
  const bay=parking.places.find(p=>p.id==='yk-14102-bayquarter');
  assert.equal(bay.displayEligible,true);assert.ok(Number.isFinite(bay.lat)&&Number.isFinite(bay.lng));
  assert.ok(bay.locationNotice);assert.equal(bay.positionPrecision,'facility-point');
  assert.equal(vehicles.profiles[bay.id].bicycle.admissionStatus,'confirmed');
  assert.equal(vehicles.profiles[bay.id].motorcycle.admissionStatus,'confirmed');
  assert.equal(vehicles.profiles[bay.id].privateElectricScooter.admissionStatus,'unknown');
  assert.match(vehicles.profiles[bay.id].bicycle.publishedFeesRaw,/3時間/);
  assert.match(vehicles.profiles[bay.id].motorcycle.publishedFeesRaw,/2時間/);
  const disputed=parking.places.find(p=>p.id==='yk-14102-cyca-949');
  assert.match(disputed.address,/亀住町/);assert.ok(!disputed.address.includes('緑園'));
});

test('Nishikawaguchi adds motorcycle facilities without applying time-based fees to monthly spaces',async()=>{
  const parking=JSON.parse(fs.readFileSync(path.join(root,'source/public/parking.json'),'utf8'));
  const vehicles=JSON.parse(fs.readFileSync(path.join(root,'source/public/vehicle-data.json'),'utf8'));
  const places=parking.places.filter(p=>p.regionalBatch==='nishikawaguchi-2026-10-20');
  assert.equal(places.length,4);
  for(const p of places){
    assert.equal(p.ward,'埼玉県川口市');assert.ok(Number.isFinite(p.lat)&&Number.isFinite(p.lng));
    const profiles=vehicles.profiles[p.id];assert.equal(profiles.motorcycle.admissionStatus,'confirmed');
    assert.equal(profiles.privateElectricScooter.admissionStatus,'unknown');
    assert.equal((await call('/api/comments?facility='+p.id)).status,200);
  }
  assert.equal(vehicles.profiles['nishi-east-coin'].motorcycle.temporaryStatus,'confirmed');
  assert.match(vehicles.profiles['nishi-east-coin'].motorcycle.classesRaw.join(' '),/原付限定/);
  for(const id of ['nishi-shiinoki-monthly','nishi-bikepark-30250','nishi-npc-341470']){
    assert.equal(vehicles.profiles[id].motorcycle.temporaryStatus,'not_offered');
    assert.equal(vehicles.profiles[id].motorcycle.regularStatus,'confirmed_application_required');
  }
  assert.ok(!places.some(p=>p.name==='西川口自転車駐車場'));
});

test('Kawaguchi audit separates current fees, annual permits, vehicle classes and unlocated facilities',async()=>{
 const parking=JSON.parse(fs.readFileSync(path.join(root,'source/public/parking.json'),'utf8'));
 const vehicles=JSON.parse(fs.readFileSync(path.join(root,'source/public/vehicle-data.json'),'utf8'));
 const report=JSON.parse(fs.readFileSync(path.join(root,'source/public/kawaguchi-review.json'),'utf8'));
 const batch=parking.places.filter(p=>p.regionalBatch==='kawaguchi-2026-10-20');
 assert.equal(batch.length,57);assert.equal(report.records.length,61);
 assert.equal(new Set(parking.places.map(p=>p.id)).size,parking.places.length);
 assert.equal(batch.filter(p=>p.researchCategory==='municipal-managed').length,16);
 const annual=batch.filter(p=>p.researchCategory==='municipal-annual');assert.equal(annual.length,18);
 assert.equal(annual.filter(p=>vehicles.profiles[p.id].motorcycle.admissionStatus==='confirmed').length,11);
 assert.equal(batch.filter(p=>!p.displayEligible).length,8);
 for(const p of batch){
  if(p.displayEligible)assert.ok(p.lat>35.7&&p.lat<35.95&&p.lng>139.6&&p.lng<139.85);
  else {assert.equal(p.lat,null);assert.equal(p.lng,null);}
  assert.equal((await call('/api/comments?facility='+p.id)).status,200);
 }
 assert.ok(!batch.some(p=>p.name==='西川口自転車駐車場'));
 assert.match(vehicles.profiles['kawaguchi-city-50990'].motorcycle.publishedFeesRaw,/300円/);
 assert.match(vehicles.profiles['kawaguchi-city-51002'].motorcycle.classesRaw.join(' '),/白ナンバー/);
 assert.equal(vehicles.profiles['kawaguchi-city-51001'].bicycle.temporaryStatus,'not_offered');
 assert.equal(vehicles.profiles['kawaguchi-city-50996'].motorcycle.regularStatus,'not_offered');
 assert.equal(vehicles.profiles['kawaguchi-city-51003'].motorcycle.admissionStatus,'unknown');
 assert.equal(vehicles.profiles['kawaguchi-city-51002'].privateElectricScooter.admissionStatus,'confirmed');
 assert.equal(vehicles.profiles['kawaguchi-kspit-moto'].privateElectricScooter.admissionStatus,'unknown');
 assert.match(vehicles.profiles['kawaguchi-kspit-moto'].motorcycle.publishedFeesRaw,/126cc以上.*600円/);
 assert.equal(vehicles.profiles['kawaguchi-kspit-moto'].motorcycle.feeEffectiveDate,'2026-10-01');
 for(const p of annual){const q=vehicles.profiles[p.id].motorcycle;if(q.admissionStatus==='confirmed'){assert.equal(q.temporaryStatus,'not_offered');assert.equal(q.regularStatus,'confirmed_annual_registration_required');assert.equal(q.registrationPeriod.end,'2027-09-30');}}
 assert.ok(report.historicalMapRows.some(r=>r.status==='outside_kawaguchi'));
 assert.ok(report.historicalMapRows.some(r=>r.sourceDate==='2018-09'));
 assert.equal(report.candidates.filter(r=>r.status==='same_name_google_position_conflicts_with_operator').length,5);
 const repark=parking.places.find(p=>p.id==='kawaguchi-repark-15139');
 assert.ok(Math.abs(repark.lat-35.831816667)<0.00001);
 assert.equal(repark.coordinateStatus,'operator_published_reference_point_not_entrance_surveyed');
});
