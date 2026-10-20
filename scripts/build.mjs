import fs from 'node:fs';
import path from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root,p), 'utf8');
const write = (p, value) => {fs.mkdirSync(path.dirname(p), {recursive:true});fs.writeFileSync(p,value);};
const oldOrigin = 'https://tomespot-test.nuttymink33.chatgpt.site';
function serializedHTML(source, marker) {
  const line = source.slice(source.indexOf(marker) + marker.length);
  const literal=line.trimStart().match(/^"(?:[^"\\]|\\.)*"/s);
  if(!literal)throw Error('Missing serialized HTML');
  return JSON.parse(literal[0]);
}
function tsBody(source) {
  return stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm,''), {mode:'strip'}).replace(/\bexport /g,'');
}
export function buildBackend() {
  const dest = path.join(root,'backend/generated');
  const common = read('source/comments.ts').replace(/import parking from .*;\r?\n/,'const parking = PARKING;\n')
    .replace("return request.headers.get('origin')===new URL(request.url).origin;", "const origin=request.headers.get('origin');return origin===new URL(request.url).origin||origin===env.FRONTEND_ORIGIN;");
  const routePaths = {comments:'api/comments',photos:'api/photos/[id]',session:'api/admin/session',queue:'api/admin/comments',moderate:'api/admin/comments/[id]',admin:'admin'};
  const handlers = Object.entries(routePaths).map(([name,p]) => {
    let source = read(`source/app/${p}/route.ts`);
    if (name==='admin') source=source.replace('/signin-with-chatgpt?return_to=%2Fadmin','/admin').replace('href=\\"/\\"', 'href=\\"'+JSON.parse(read('deploy-config.json')).siteUrl+'/\\"');
    const methods = [...source.matchAll(/export (?:async )?function (GET|POST|PATCH)/g)].map(m=>m[1]);
    return `${name}:(()=>{${tsBody(source)}\nreturn {${methods.join(',')}};})()`;
  });
  const facilities = JSON.parse(read('source/public/parking.json')).places.map(p=>({id:p.id,name:p.name}));
  const worker = `${read('backend/gateway.mjs')}\nconst PARKING=${JSON.stringify({places:facilities})};\nfunction makeRoutes(env){${tsBody(common)}\nreturn {${handlers.join(',\n')}};}\nexport default {fetch(request,env){return dispatch(request,env,makeRoutes(env));}};\n`;
  write(path.join(dest,'worker.mjs'), worker);
  for (const f of ['admin.js','comments.css','locales.json']) write(path.join(dest,'assets',f),read('source/public/'+f));
  return dest;
}
export function buildSupabaseBackend() {
  const dest=path.join(root,'supabase/functions/tomespot');
  let common=read('source/comments.ts').replace(/import parking from .*;\r?\n/,'const parking = PARKING;\n')
    .replace("return request.headers.get('origin')===new URL(request.url).origin;", "const origin=request.headers.get('origin');return origin===env.FRONTEND_ORIGIN;");
  const paths={comments:'api/comments',photos:'api/photos/[id]',session:'api/admin/session',queue:'api/admin/comments',moderate:'api/admin/comments/[id]'};
  const handlers=Object.entries(paths).map(([name,p])=>{
    let source=read(`source/app/${p}/route.ts`).replace("(request.headers.get('cf-connecting-ip')||request.headers.get('oai-authenticated-user-id')||'anonymous')", "(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'anonymous')");
    const methods=[...source.matchAll(/export (?:async )?function (GET|POST|PATCH)/g)].map(m=>m[1]);
    return `${name}:(()=>{${tsBody(source)}\nreturn {${methods.join(',')}};})()`;
  });
  let gateway=read('backend/gateway.mjs').slice(read('backend/gateway.mjs').indexOf('export function cors'))
    .replace('Administrator sign-in required. Open /admin through Cloudflare Access.','Administrator sign-in required.')
    .replaceAll("'GET, POST, OPTIONS'","'GET, POST, PATCH, OPTIONS'")
    .replaceAll("'Content-Type'", "'Content-Type, Authorization'")
    .replace("['GET','POST'].includes", "['GET','POST','PATCH'].includes")
    .replace('path = url.pathname;',"path = url.pathname.replace(/^\\/(?:functions\\/v1\\/)?tomespot(?=\\/|$)/,'');")
    .replace("else if ((path === '/admin' || path === '/admin/') && request.method === 'GET') result = routes.admin.GET();", "else if (path === '/admin' || path === '/admin/') result = new Response('Use the administrator page on GitHub Pages.', {status:404});")
    .replace("else if (['/admin.js','/comments.css','/locales.json'].includes(path) && request.method === 'GET') result = await env.ASSETS.fetch(request);",'');
  const places=JSON.parse(read('source/public/parking.json')).places.map(p=>({id:p.id,name:p.name}));
  const source=read('supabase/adapter.mjs')+'\nconst verifyAdmin=verifySupabaseAdmin;\n'+gateway+`\nconst PARKING=${JSON.stringify({places})};\nfunction makeRoutes(env){${tsBody(common)}\nreturn {${handlers.join(',\n')}};}\nexport function handle(request,settings){const env={...settings,...createStorage(settings)};return dispatch(request,env,makeRoutes(env));}\nif(typeof Deno!=='undefined'){const names=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','ADMIN_EMAIL','FRONTEND_ORIGIN','COMMENT_HASH_SALT'];const settings=Object.fromEntries(names.map(k=>[k,Deno.env.get(k)]));Deno.serve(request=>handle(request,settings));}\n`;
  write(path.join(dest,'index.ts'),source);
  return dest;
}
export function buildFrontend({apiBase,siteUrl,output=path.join(root,'dist')}={}) {
  const config=JSON.parse(read('deploy-config.json'));
  apiBase=(apiBase||process.env.TOMESPOT_API_URL||config.apiBase||'').replace(/\/$/,'');
  siteUrl=(siteUrl||config.siteUrl).replace(/\/$/,'');
  if (!/^https:\/\/[^/]+(?:\/functions\/v1\/tomespot)?$/.test(apiBase)) throw Error('Set TOMESPOT_API_URL to your deployed backend URL before publishing.');
  if (!/^https:\/\/[^/]+$/.test(siteUrl)) throw Error('Use the root repository cliozhu0810-design.github.io; siteUrl must be an HTTPS origin.');
  const isSupabase=apiBase.endsWith('/functions/v1/tomespot');
  const supabaseKey=process.env.TOMESPOT_SUPABASE_KEY||config.supabaseKey||'';
  if(isSupabase&&!supabaseKey)throw Error('Set TOMESPOT_SUPABASE_KEY to the public publishable/anon key. Never use service_role or a secret key.');
  if(supabaseKey.startsWith('sb_secret_'))throw Error('A secret key must never be published. Use the publishable key.');
  if(supabaseKey.split('.').length===3){try{if(JSON.parse(Buffer.from(supabaseKey.split('.')[1],'base64url')).role!=='anon')throw Error('Only an anon JWT key is allowed in public config.');}catch(e){throw Error('Invalid public Supabase key: '+e.message);}}
  const htmlPath=p => !p.startsWith('/')||p.split(/[?#]/)[0]==='/'||/\.[a-z0-9]+(?:[?#]|$)/i.test(p)||p.startsWith('//') ? p : p.replace(/^([^?#]*)(.*)$/, '$1.html$2');
  const rewrite = text => text.replaceAll(oldOrigin,siteUrl)
    .replace(/<meta name="google-site-verification"[^>]*\/?\s*>/g,'')
    .replace(/(href=")([^"\s]+)(")/g,(_,a,p,b)=>a+htmlPath(p)+b)
    .replace(new RegExp(siteUrl.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(/[^"<\\s]*)','g'),(_,p)=>siteUrl+htmlPath(p));
  const allowed = /^(parking\/[^/]+\.html|vendor\/.+|(?:app\.js|comments\.js|comments\.css|data-locales\.json|icon\.svg|locales\.json|parking\.json|vehicle-data\.json|style\.css|search-pages\.css|parking-directory\.html|kickboard-parking\.html|bicycle-parking\.html|motorcycle-parking\.html|robots\.txt|sitemap\.xml))$/;
  function copy(dir,relative='') {
    for(const item of fs.readdirSync(dir,{withFileTypes:true})) {
      const rel=relative+item.name, full=path.join(dir,item.name);
      if(item.isDirectory()) {copy(full,rel+'/');continue;}
      if(!allowed.test(rel)) continue;
      let body=fs.readFileSync(full);
      if(/\.(html|xml|txt|json|js|css)$/.test(rel)) body=rewrite(body.toString());
      if(rel==='app.js') body=body.replace(/fetch\('\/api\/admin\/session'\)[\s\S]*$/,'');
      if(rel==='comments.js') body=body.replaceAll("fetch('/api/comments", "fetch(tomespotApi('/api/comments")
        .replace("+offset);", "+offset));")
        .replace("fetch(tomespotApi('/api/comments',{", "fetch(tomespotApi('/api/comments'),{")
        .replaceAll('a.href=url;', 'a.href=tomespotApi(url);').replaceAll('img.src=url;', 'img.src=tomespotApi(url);');
      write(path.join(output,rel),body);
    }
  }
  copy(path.join(root,'source/public'));
  let html=rewrite(serializedHTML(read('source/app/map-html.ts'),'export const html = '));
  html=html.replace('href="/admin.html" id="admin-link" hidden',`href="${isSupabase?'/admin.html':apiBase+'/admin'}" id="admin-link"`)
    .replace('<script defer src="app.js"></script>','<script src="config.js"></script><script defer src="app.js"></script>');
  write(path.join(output,'index.html'),html);
  write(path.join(output,'config.js'),`window.TOMESPOT_CONFIG=${JSON.stringify({apiBase,siteUrl,...(isSupabase?{supabaseUrl:apiBase.split('/functions/')[0],supabaseKey}:{})})};\nfunction tomespotApi(p){return /^(https?:|blob:)/.test(p)?p:window.TOMESPOT_CONFIG.apiBase+p;}\n`);
  if(isSupabase){
    let admin=serializedHTML(read('source/app/admin/route.ts'),'const html=');
    admin=admin.replace('/signin-with-chatgpt?return_to=%2Fadmin','#login')
      .replace('<script src="/admin.js" defer></script>','<script src="/config.js"></script><script src="/admin-auth.js" defer></script><script src="/admin.js" defer></script>')
      .replace('<h1 data-i18n="adminTitle">','<section id="login"><form id="admin-login"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">ログイン / 登录 / Sign in</button><p id="login-status" role="status"></p></form><button id="admin-logout" type="button">ログアウト / 退出 / Sign out</button></section><h1 data-i18n="adminTitle">');
    write(path.join(output,'admin.html'),admin);
    let adminJS=read('source/public/admin.js').replace('function renderCards(){','function renderCards(){clearAdminPhotos();').replaceAll('link.href=url;', 'link.href="#";').replaceAll('img.src=url;', 'loadAdminPhoto(url,img,link);');
    write(path.join(output,'admin.js'),adminJS);
    write(path.join(output,'admin-auth.js'),read('supabase/admin-auth.js'));
  }
  write(path.join(output,'.nojekyll'),'');
  write(path.join(output,'404.html'),'<!doctype html><meta charset="utf-8"><title>Tomespot</title><p>ページが見つかりません / 页面不存在。</p><a href="/">Tomespot</a>');
  return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  buildSupabaseBackend();
  if(!process.argv.includes('--backend-only')) buildFrontend();
  console.log('Build complete.');
}
