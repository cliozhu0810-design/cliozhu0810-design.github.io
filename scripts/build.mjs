import fs from 'node:fs';
import path from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root,p), 'utf8');
const write = (p, value) => {fs.mkdirSync(path.dirname(p), {recursive:true});fs.writeFileSync(p,value);};
const oldOrigin = 'https://tomespot-test.nuttymink33.chatgpt.site';
const searchPages = {
  'index.html': {
    title:'東京の駐輪場マップ｜電動キックボード・自転車・バイク｜トメスポ',
    description:'東京の電動キックボード駐輪場、自転車駐輪場、バイク駐輪場を地図と一覧で検索。一時利用・定期利用の料金や受入条件を比較できます。横浜市神奈川区の自転車・バイク駐輪場も一部掲載。トメスポ / Tomespot by muko。'
  },
  'kickboard-parking.html': {
    title:'東京の電動キックボード駐輪場｜停める場所・料金を探す｜トメスポ',
    heading:'東京の電動キックボード駐輪場・停める場所',
    description:'電動キックボードをどこに止めるか迷ったら、東京の電動キックボード駐輪場を地域別に検索。一時利用・定期利用の料金、個人所有のキックボードの受入条件、公式案内を確認できます。',
    questions:[
      ['電動キックボードをどこに止める？','目的地近くの電動キックボード駐輪場を探し、特定小型原動機付自転車など自分の車両区分が利用できるか確認してください。自転車対応だけでは電動キックボードも停められるとは限りません。'],
      ['「キックボード駐車場」で探している場合も使えますか？','トメスポでは、個人所有の電動キックボードを停める場所を駐輪場として掲載しています。施設ごとの車両条件、指定区画、料金、申請の要否を確認できます。シェアサービスの返却ポートとは異なります。'],
      ['一時利用と定期利用はどう違いますか？','短時間の買い物などには一時利用、通勤など継続して利用する場合には定期利用の条件を確認してください。年度・年期登録の施設も定期利用から探せます。申請や登録シールが必要な場合があります。']
    ]
  },
  'bicycle-parking.html': {
    title:'東京・横浜市神奈川区の自転車駐輪場｜料金・定期利用｜トメスポ',
    heading:'東京・横浜市神奈川区の自転車駐輪場',
    description:'東京・横浜市神奈川区の自転車駐輪場を駅や地域から検索。一時利用、無料時間、定期利用の料金や利用条件を確認し、目的地近くで自転車を停める場所を探せます。',
    questions:[['自転車駐輪場の料金や無料時間はどこで確認できますか？','施設の詳細から一時利用・定期利用の料金と利用条件を確認できます。無料時間の設定や利用時間は施設によって異なります。最新の料金や募集状況は公式案内をご確認ください。']]
  },
  'motorcycle-parking.html': {
    title:'東京・横浜市神奈川区のバイク駐輪場・原付駐輪場｜トメスポ',
    heading:'東京・横浜市神奈川区のバイク駐輪場・原付駐輪場',
    description:'東京・横浜市神奈川区のバイク駐輪場・原付駐輪場を地域別に検索。排気量や車両区分の受入条件、一時利用・定期利用の料金を確認し、バイクを停める場所を探せます。',
    questions:[['原付を停められる駐輪場なら、どのバイクでも利用できますか？','原付対応の施設でも、すべてのバイクが利用できるとは限りません。排気量、車幅、車長、指定区画などの受入条件を施設ごとに確認してください。']]
  }
};
function searchHTML(html,file,siteUrl) {
  const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const pretty=siteUrl.endsWith('.pages.dev');
  const publicPath=file==='index.html'?'/':'/'+(pretty?file.replace(/\.html$/,''):file);
  const canonical=siteUrl+publicPath;
  html=html.replace(/<link\s+rel="canonical"[^>]*>/g,'').replace(/<meta\s+property="og:url"[^>]*>/g,'');
  html=html.replace('</head>',`<link rel="canonical" href="${escape(canonical)}"><meta property="og:url" content="${escape(canonical)}"></head>`);
  // Structured data uses the same URLs as canonicals; ordinary links can keep .html for GitHub compatibility.
  html=html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,(_,data)=>{
    const obj=JSON.parse(data),visit=value=>typeof value==='string'&&pretty&&value.startsWith(siteUrl)?value.replace(/\.html(?=[#?]|$)/,''):Array.isArray(value)?value.map(visit):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v)])):value;
    return '<script type="application/ld+json">'+JSON.stringify(visit(obj)).replaceAll('<','\\u003c')+'</script>';
  });
  const page=searchPages[file];
  if(page){
    html=html.replace(/<title>[^<]*<\/title>/,`<title>${escape(page.title)}</title>`)
      .replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${escape(page.description)}">`)
      .replace(/<meta property="og:title"[^>]*>/,`<meta property="og:title" content="${escape(page.title)}">`)
      .replace(/<meta property="og:description"[^>]*>/,`<meta property="og:description" content="${escape(page.description)}">`);
    if(file==='index.html'){
      html=html.replace(/(<h1 data-i18n="title">)[\s\S]*?(<\/h1>)/,'$1'+escape(page.title)+'$2').replace(/(<p data-i18n="description">)[\s\S]*?(<\/p>)/,'$1'+escape(page.description)+'$2');
      const website={'@context':'https://schema.org','@type':'WebSite','@id':siteUrl+'/#website',url:siteUrl+'/',name:'トメスポ',alternateName:['Tomespot','muko Tomespot'],description:page.description,inLanguage:['ja','zh-Hans','zh-Hant','en'],publisher:{'@type':'Organization',name:'muko'}};
      html=html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g,'').replace('</head>','<script type="application/ld+json">'+JSON.stringify(website)+'</script></head>');
    }else{
      html=html.replace(/<h1>[^<]*<\/h1><p>[^<]*<\/p>/,`<h1>${escape(page.heading)}</h1><p>${escape(page.description)}</p>`);
      html=html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,(_,data)=>{
        const obj=JSON.parse(data);if(obj['@type']==='CollectionPage')Object.assign(obj,{name:page.heading,description:page.description,url:canonical});
        return '<script type="application/ld+json">'+JSON.stringify(obj).replaceAll('<','\\u003c')+'</script>';
      });
      html=html.replace('<h2>地域別の',`<section aria-labelledby="parking-guide"><h2 id="parking-guide">駐輪場の探し方・よくある質問</h2>${page.questions.map(([q,a])=>`<h3>${escape(q)}</h3><p>${escape(a)}</p>`).join('')}</section><h2>地域別の`);
    }
  }
  return html;
}
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
  siteUrl=(siteUrl||process.env.TOMESPOT_SITE_URL||config.siteUrl).replace(/\/$/,'');
  if (!/^https:\/\/[^/]+(?:\/functions\/v1\/tomespot)?$/.test(apiBase)) throw Error('Set TOMESPOT_API_URL to your deployed backend URL before publishing.');
  if (!/^https:\/\/[^/]+$/.test(siteUrl)) throw Error('Use the root repository cliozhu0810-design.github.io; siteUrl must be an HTTPS origin.');
  const isSupabase=apiBase.endsWith('/functions/v1/tomespot');
  const supabaseKey=process.env.TOMESPOT_SUPABASE_KEY||config.supabaseKey||'';
  if(isSupabase&&!supabaseKey)throw Error('Set TOMESPOT_SUPABASE_KEY to the public publishable/anon key. Never use service_role or a secret key.');
  if(supabaseKey.startsWith('sb_secret_'))throw Error('A secret key must never be published. Use the publishable key.');
  if(supabaseKey.split('.').length===3){try{if(JSON.parse(Buffer.from(supabaseKey.split('.')[1],'base64url')).role!=='anon')throw Error('Only an anon JWT key is allowed in public config.');}catch(e){throw Error('Invalid public Supabase key: '+e.message);}}
  const htmlPath=p => !p.startsWith('/')||p.split(/[?#]/)[0]==='/'||/\.[a-z0-9]+(?:[?#]|$)/i.test(p)||p.startsWith('//') ? p : p.replace(/^([^?#]*)(.*)$/, '$1.html$2');
  const standardizeTerms = text => text
    .replaceAll('電動キックボードの駐車場・停める場所','電動キックボードの駐輪場')
    .replaceAll('電動キックボード駐車場・停める場所','電動キックボード駐輪場')
    .replaceAll('自転車駐車場・駐輪場','自転車駐輪場')
    .replaceAll('駐車場・駐輪場','駐輪場')
    .replaceAll('目的地近くの駐車場','目的地近くの駐輪場')
    .replaceAll('バイク駐車場・原付の駐輪場','バイク・原付の駐輪場');
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
      if(/\.(html|xml|txt|json|js|css)$/.test(rel)) {
        body=body.toString();
        if(rel.endsWith('.html')||rel==='locales.json') body=standardizeTerms(body);
        body=rewrite(body);
      }
      if(rel==='app.js') body=body.replace(/fetch\('\/api\/admin\/session'\)[\s\S]*$/,'');
      if(rel==='comments.js') body=body.replaceAll("fetch('/api/comments", "fetch(tomespotApi('/api/comments")
        .replace("+offset);", "+offset));")
        .replace("fetch(tomespotApi('/api/comments',{", "fetch(tomespotApi('/api/comments'),{")
        .replaceAll('a.href=url;', 'a.href=tomespotApi(url);').replaceAll('img.src=url;', 'img.src=tomespotApi(url);');
      if(rel.endsWith('.html'))body=searchHTML(body,rel,siteUrl);
      if(rel==='locales.json'){
        const messages=JSON.parse(body);
        messages.title.ja=searchPages['index.html'].title;
        messages.description.ja=searchPages['index.html'].description;
        body=JSON.stringify(messages);
      }
      if(rel==='sitemap.xml'&&siteUrl.endsWith('.pages.dev'))body=body.replace(/\.html(?=<\/loc>)/g,'');
      write(path.join(output,rel),body);
    }
  }
  copy(path.join(root,'source/public'));
  let html=rewrite(standardizeTerms(serializedHTML(read('source/app/map-html.ts'),'export const html = ')));
  html=html.replace('href="/admin.html" id="admin-link" hidden',`href="${isSupabase?'/admin.html':apiBase+'/admin'}" id="admin-link"`)
    .replace('<script defer src="app.js"></script>','<script src="config.js"></script><script defer src="app.js"></script>');
  write(path.join(output,'index.html'),searchHTML(html,'index.html',siteUrl));
  write(path.join(output,'config.js'),`window.TOMESPOT_CONFIG=${JSON.stringify({apiBase,siteUrl,...(isSupabase?{supabaseUrl:apiBase.split('/functions/')[0],supabaseKey}:{})})};\nfunction tomespotApi(p){return /^(https?:|blob:)/.test(p)?p:window.TOMESPOT_CONFIG.apiBase+p;}\n`);
  if(isSupabase){
    let admin=serializedHTML(read('source/app/admin/route.ts'),'const html=');
    admin=admin.replace('/signin-with-chatgpt?return_to=%2Fadmin','#login')
      .replace('<script src="/admin.js" defer></script>','<script src="/config.js"></script><script src="/admin-auth.js" defer></script><script src="/admin.js" defer></script>')
      .replace('<h1 data-i18n="adminTitle">','<section id="login"><form id="admin-login"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">ログイン / 登录 / Sign in</button><p id="login-status" role="status"></p></form><button id="admin-logout" type="button">ログアウト / 退出 / Sign out</button></section><h1 data-i18n="adminTitle">');
    admin=admin.replace('</head>','<meta name="robots" content="noindex,nofollow"></head>');
    write(path.join(output,'admin.html'),admin);
    let adminJS=read('source/public/admin.js').replace('function renderCards(){','function renderCards(){clearAdminPhotos();').replaceAll('link.href=url;', 'link.href="#";').replaceAll('img.src=url;', 'loadAdminPhoto(url,img,link);');
    write(path.join(output,'admin.js'),adminJS);
    write(path.join(output,'admin-auth.js'),read('supabase/admin-auth.js'));
  }
  write(path.join(output,'.nojekyll'),'');
  write(path.join(output,'404.html'),'<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Tomespot</title><p>ページが見つかりません / 页面不存在。</p><a href="/">Tomespot</a>');
  return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  buildSupabaseBackend();
  if(!process.argv.includes('--backend-only')) buildFrontend();
  console.log('Build complete.');
}
