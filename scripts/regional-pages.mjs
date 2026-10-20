import fs from 'node:fs';
import path from 'node:path';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function addRegionalPages({root,output,siteUrl}){
 const parking=JSON.parse(fs.readFileSync(path.join(root,'source/public/parking.json'),'utf8'));
 const vehicles=JSON.parse(fs.readFileSync(path.join(root,'source/public/vehicle-data.json'),'utf8'));
 const places=parking.places.filter(p=>p.regionalBatch==='nishikawaguchi-2026-10-20');
 const link=p=>`/parking/${p.id}.html`;
 const canonicalPath=p=>`/parking/${p.id}${siteUrl.endsWith('.pages.dev')?'':'.html'}`;
 const guide=`<section><h2>西川口駅周辺の原付・バイク駐輪場</h2><p>東口・西口の一時利用と月極を区別して掲載しています。原付限定の施設を一般バイク対応とは扱っていません。</p><p><a href="/?vehicle=motorcycle&amp;ward=${encodeURIComponent('埼玉県川口市')}">西川口周辺をバイクの地図で見る</a></p><ul>${places.map(p=>`<li><a href="${link(p)}">${esc(p.name)}</a></li>`).join('')}</ul><p>西川口自転車駐車場は2026年9月30日閉鎖。<a href="https://www.city.kawaguchi.lg.jp/soshiki/01130/030/4/jitensyachusyajo/50995.html">川口市の閉鎖案内</a>をご確認ください。</p></section>`;
 for(const p of places){
  const q=vehicles.profiles[p.id].motorcycle,canonical=siteUrl+canonicalPath(p),description=`西川口駅周辺の${p.name}。${q.temporaryStatus==='confirmed'?'原付の一時利用':'バイクの月極契約'}の車両条件・料金・公式案内。`;
  const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.name)} | トメスポ</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}"><link rel="stylesheet" href="/search-pages.css"><link rel="icon" href="/icon.svg"></head><body><header><a href="/">トメスポ <small>Tomespot</small></a><nav><a href="/parking-directory.html">駐輪場一覧</a></nav></header><main><h1>${esc(p.name)}</h1><p>${esc(p.address)}</p><p>${esc(description)}</p><p>施設の参考位置です。正確な入口・指定区画は現地で確認してください。</p><h2>対象車両</h2><p>${q.classesRaw.map(esc).join(' / ')}</p><h2>利用方法</h2><p>${q.temporaryStatus==='confirmed'?'一時利用（原付限定）':'月極・事前契約が必要。一時利用としては掲載していません。'}</p><h2>料金</h2><p>${esc(q.publishedFeesRaw)}</p><h2>利用時間</h2><p>${esc(q.hours)}</p><h2>条件と注意事項</h2>${q.currentConditionsRaw.map(n=>`<p>${esc(n)}</p>`).join('')}<p>電動キックボードの受入可否は未確認です。リアルタイムの空き状況は提供していません。</p><p>確認日：${esc(q.checked)}</p>${q.sources.map(s=>`<p><a href="${esc(s.url)}">運営者・掲載団体の案内</a></p>`).join('')}<p><a href="/?vehicle=motorcycle&amp;place=${encodeURIComponent(p.id)}">地図で確認・コメントする</a></p></main></body></html>`;
  fs.writeFileSync(path.join(output,'parking',p.id+'.html'),html);
 }
 for(const file of ['parking-directory.html','motorcycle-parking.html','about.html']){
  const target=path.join(output,file);if(fs.existsSync(target))fs.writeFileSync(target,fs.readFileSync(target,'utf8').replace('</main>',guide+'</main>'));
 }
 const sitemap=path.join(output,'sitemap.xml');fs.writeFileSync(sitemap,fs.readFileSync(sitemap,'utf8').replace('</urlset>',places.map(p=>`<url><loc>${siteUrl+canonicalPath(p)}</loc></url>`).join('')+'</urlset>'));
}
