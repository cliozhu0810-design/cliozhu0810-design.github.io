import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {buildSupabaseBackend,buildFrontend,root} from './build.mjs';
import {createStorage,verifySupabaseAdmin} from '../supabase/adapter.mjs';
buildSupabaseBackend();
const {handle}=await import('../supabase/functions/tomespot/index.ts');
const origin='https://cliozhu0810-design.github.io';
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public-key-test',SUPABASE_SERVICE_ROLE_KEY:'server-only-secret',ADMIN_EMAIL:'owner@example.com',FRONTEND_ORIGIN:origin,COMMENT_HASH_SALT:'test-only-salt'};
const comments=new Map(),photos=new Map(),limits=new Map();
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,opts={})=>{
  const url=new URL(input),p=url.pathname;
  if(p==='/auth/v1/user'){
    if(opts.headers.Authorization==='Bearer valid-admin')return Response.json({id:'owner',email:env.ADMIN_EMAIL,email_confirmed_at:'2026-10-20'});
    if(opts.headers.Authorization==='Bearer nonadmin')return Response.json({id:'visitor',email:'other@example.com',email_confirmed_at:'2026-10-20'});
    return Response.json({error:'invalid'},{status:401});
  }
  assert.equal(opts.headers.apikey,'server-only-secret');assert.equal(opts.headers.Authorization,'Bearer server-only-secret');
  if(p==='/rest/v1/rpc/tomespot_rate_limit'){const body=JSON.parse(opts.body);const count=(limits.get(body.p_key)||0)+1;limits.set(body.p_key,count);return Response.json({count});}
  if(p==='/rest/v1/comments'){
    const id=url.searchParams.get('id')?.slice(3);
    if(opts.method==='POST'){const row={...JSON.parse(opts.body),reviewed_at:null,reviewer:null};if(comments.has(row.id))return Response.json({error:'conflict'},{status:409});comments.set(row.id,row);return new Response(null,{status:201});}
    if(opts.method==='PATCH'){const row=comments.get(id);if(!row)return Response.json([]);Object.assign(row,JSON.parse(opts.body));return Response.json([{id}]);}
    let rows=[...comments.values()];if(id)rows=rows.filter(r=>r.id===id);
    for(const k of ['facility_id','status'])if(url.searchParams.has(k))rows=rows.filter(r=>r[k]===url.searchParams.get(k).slice(3));
    if(url.searchParams.get('select')==='submission_hash')rows=rows.map(r=>({submission_hash:r.submission_hash}));
    return Response.json(rows.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+Number(url.searchParams.get('limit')||rows.length)));
  }
  if(p.startsWith('/storage/v1/object/')){
    if(opts.method==='DELETE'){for(const key of JSON.parse(opts.body).prefixes)photos.delete(key);return Response.json({});}
    const key=decodeURIComponent(p.replace(/^\/storage\/v1\/object\/(authenticated\/)?tomespot-photos\//,''));
    if(opts.method==='POST'){photos.set(key,{body:opts.body,type:opts.headers['Content-Type']});return Response.json({});}
    const photo=photos.get(key);return photo?new Response(photo.body,{headers:{'Content-Type':photo.type}}):new Response(null,{status:404});
  }
  throw Error('Unexpected upstream '+input);
};
const call=(p,options={})=>handle(new Request(env.SUPABASE_URL+'/functions/v1/tomespot'+p,options),env);
test('routes both the public gateway URL and Supabase runtime URL',async()=>{
  const facility=JSON.parse(fs.readFileSync(path.join(root,'source/public/parking.json'))).places[0].id;
  for(const prefix of ['/functions/v1/tomespot','/tomespot']){
    const response=await handle(new Request(env.SUPABASE_URL+prefix+'/api/comments?facility='+facility),env);
    assert.equal(response.status,200);
  }
});
test('Supabase administrator identity is verified by Auth; forged headers and nonadmins fail',async()=>{
  for(const token of ['invalid','nonadmin'])assert.equal(await verifySupabaseAdmin(new Request(origin,{headers:{Authorization:'Bearer '+token}}),env),null);
  assert.equal((await call('/api/admin/session',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':env.ADMIN_EMAIL}})).status,403);
  assert.equal((await (await call('/api/admin/session',{headers:{Authorization:'Bearer valid-admin'}})).json()).admin,true);
});
test('Supabase private-photo and moderation flow, CORS and rate limit work through the adapter',async()=>{
  const facility=JSON.parse(fs.readFileSync(path.join(root,'source/public/parking.json'))).places[0].id;
  const id=crypto.randomUUID(),data=new FormData();
  for(const [k,v]of Object.entries({id,facility,vehicle:'bicycle',body:'Supabase test'}))data.set(k,v);
  data.set('photos',new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1])],{type:'image/png'}),'photo.png');
  assert.equal((await call('/api/comments',{method:'POST',headers:{Origin:'https://other.example'},body:data})).status,403);
  assert.equal((await call('/api/comments',{method:'POST',headers:{Origin:origin,'x-forwarded-for':'192.0.2.1'},body:data})).status,201);
  const publicList=await call('/api/comments?facility='+facility,{headers:{Origin:origin}});
  assert.equal(publicList.headers.get('Access-Control-Allow-Origin'),origin);assert.deepEqual((await publicList.json()).comments,[]);
  assert.equal((await call('/api/photos/'+id+'?index=0')).status,404);
  assert.equal((await call('/api/photos/'+id+'?index=0',{headers:{Authorization:'Bearer valid-admin'}})).status,200);
  const auth={Authorization:'Bearer valid-admin',Origin:origin,'Content-Type':'application/json'};
  assert.equal((await call('/api/admin/comments/'+id,{method:'PATCH',headers:auth,body:JSON.stringify({status:'approved',note:'private'})})).status,200);
  const published=(await (await call('/api/comments?facility='+facility)).json()).comments;
  assert.equal(published.length,1);assert.equal(published[0].adminNote,undefined);assert.equal((await call(published[0].photos[0])).status,200);
  await call('/api/admin/comments/'+id,{method:'PATCH',headers:auth,body:JSON.stringify({status:'rejected',note:''})});
  assert.equal((await call(published[0].photos[0])).status,404);
  const preflight=await call('/api/admin/comments/'+id,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'PATCH'}});
  assert.equal(preflight.status,204);assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/Authorization/);
  for(let i=0;i<6;i++){const form=new FormData();for(const[k,v]of Object.entries({id:crypto.randomUUID(),facility,vehicle:'bicycle',body:'rate'}))form.set(k,v);assert.equal((await call('/api/comments',{method:'POST',headers:{Origin:origin,'x-forwarded-for':'192.0.2.22'},body:form})).status,i<5?201:429);}
});
test('private storage adapter does not make missing photos public',async()=>{
  assert.equal(await createStorage(env).BUCKET.get('missing'),null);
});
test('general parking tips use the existing moderation queue and stay separate from facility comments',async()=>{
  const id=crypto.randomUUID(),data=new FormData();
  for(const [k,v] of Object.entries({id,facility:'__general__',vehicle:'privateElectricScooter',region:'池袋駅周辺',body:'池袋站附近的某某停车场可以停滑板车。'}))data.set(k,v);
  const submit=()=>call('/api/comments',{method:'POST',headers:{Origin:origin,'x-forwarded-for':'192.0.2.90'},body:data});
  assert.equal((await submit()).status,201);
  assert.equal((await submit()).status,200);
  assert.equal(comments.get(id).status,'pending');
  const list=async()=> (await (await call('/api/comments?facility=__general__')).json()).comments;
  assert.deepEqual(await list(),[]);
  const auth={Authorization:'Bearer valid-admin',Origin:origin,'Content-Type':'application/json'};
  const queue=(await (await call('/api/admin/comments?status=pending',{headers:auth})).json()).comments;
  assert.equal(queue.find(c=>c.id===id).kind,'general');
  assert.equal((await call('/api/admin/comments/'+id,{method:'PATCH',headers:auth,body:JSON.stringify({status:'approved',note:'verify later'})})).status,200);
  const published=(await list()).find(c=>c.id===id);
  assert.equal(published.region,'池袋駅周辺');assert.equal(published.body,data.get('body'));assert.equal(published.kind,'general');assert.equal(published.adminNote,undefined);
  const facility=JSON.parse(fs.readFileSync(path.join(root,'source/public/parking.json'))).places[0].id;
  assert.ok(!(await (await call('/api/comments?facility='+facility)).json()).comments.some(c=>c.id===id));
  data.set('facility','__not_a_facility__');data.set('id',crypto.randomUUID());assert.equal((await submit()).status,400);
  data.set('facility','__general__');data.set('body','');assert.equal((await submit()).status,400);
  data.set('body','x'.repeat(2001));assert.equal((await submit()).status,400);
  assert.ok(!JSON.parse(fs.readFileSync(path.join(root,'source/public/parking.json'))).places.some(p=>p.id==='__general__'));
});
test('new moped and motorcycle comments stay separate while old combined comments retain their label',async()=>{
 const ids=[];
 for(const vehicle of ['moped','motorcycle']){
  const id=crypto.randomUUID(),data=new FormData();ids.push(id);
  for(const [key,value]of Object.entries({id,facility:'__general__',vehicle,body:'four-category test'}))data.set(key,value);
  assert.equal((await call('/api/comments',{method:'POST',headers:{Origin:origin,'x-forwarded-for':'192.0.2.93'},body:data})).status,201);
  assert.equal(comments.get(id).vehicle,vehicle==='motorcycle'?'motorcycleV2':'moped');
  comments.get(id).status='approved';
 }
 const legacyId=crypto.randomUUID();comments.set(legacyId,{...comments.get(ids[1]),id:legacyId,vehicle:'motorcycle'});
 const published=(await (await call('/api/comments?facility=__general__')).json()).comments;
 assert.equal(published.find(c=>c.id===ids[0]).vehicle,'moped');
 assert.equal(published.find(c=>c.id===ids[1]).vehicle,'motorcycle');
 assert.equal(published.find(c=>c.id===ids[1]).legacyMotorcycle,false);
 assert.equal(published.find(c=>c.id===legacyId).legacyMotorcycle,true);
});
test('Pages build uses function path, static administrator page and public keys only',()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'tomespot-supabase-'));
  const saved=process.env.TOMESPOT_SUPABASE_KEY;
  try{
    process.env.TOMESPOT_SUPABASE_KEY='sb_secret_forbidden';
    assert.throws(()=>buildFrontend({apiBase:env.SUPABASE_URL+'/functions/v1/tomespot',output:out}),/secret key/);
    process.env.TOMESPOT_SUPABASE_KEY='sb_publishable_test';
    buildFrontend({apiBase:env.SUPABASE_URL+'/functions/v1/tomespot',output:out});
    const config=fs.readFileSync(path.join(out,'config.js'),'utf8');assert.ok(!config.includes('server-only-secret'));
    const context=vm.createContext({window:{},URL});vm.runInContext(config,context);
    assert.equal(vm.runInContext("tomespotApi('/api/comments')",context),env.SUPABASE_URL+'/functions/v1/tomespot/api/comments');
    for(const file of ['admin.js','admin-auth.js','comments.js'])new vm.Script(fs.readFileSync(path.join(out,file),'utf8'));
    const admin=fs.readFileSync(path.join(out,'admin.html'),'utf8');assert.ok(!admin.includes('signin-with-chatgpt'));assert.match(admin,/admin-login/);
    assert.match(fs.readFileSync(path.join(out,'index.html'),'utf8'),/href="\/admin.html"/);
  }finally{if(saved===undefined)delete process.env.TOMESPOT_SUPABASE_KEY;else process.env.TOMESPOT_SUPABASE_KEY=saved;fs.rmSync(out,{recursive:true,force:true});}
});
