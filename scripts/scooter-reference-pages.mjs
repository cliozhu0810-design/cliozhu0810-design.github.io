import fs from 'node:fs';
import path from 'node:path';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=url=>{try{return new URL(url).protocol==='https:'?url:'';}catch{return '';}};
export function referenceHTML(q){return (q.referenceEvidence||[]).map(e=>`<aside class="reference-evidence" style="border:1px solid #c9a660;border-radius:12px;padding:16px;margin:16px 0;background:#fff9ec"><strong>${esc(e.label)}</strong><p>${esc(e.summary)}</p>${(e.details||[]).map(d=>`<p>${esc(d)}</p>`).join('')}<p>閲覧日：${esc(e.checked)}。参考情報は現在の受入許可・料金を保証しません。</p><ul>${(e.sources||[]).filter(s=>safeURL(s.url)).map(s=>`<li><a href="${esc(s.url)}" rel="noopener noreferrer">${esc(s.label)}</a>${s.published?'（資料日：'+esc(s.published)+'）':''}</li>`).join('')}</ul></aside>`).join('');}
export function addScooterReferencePage({root,output,siteUrl}){
 const report=JSON.parse(fs.readFileSync(path.join(root,'source/public/ikebukuro-scooter-references.json'),'utf8'));
 fs.copyFileSync(path.join(root,'source/public/ikebukuro-scooter-references.json'),path.join(output,'ikebukuro-scooter-references.json'));
 const candidates=[['fk-ikebukuro2-listing','fk-ikebukuro2'],['seibu-minami-ikebukuro','seibu-minami-ikebukuro']];
 const canonical=p=>siteUrl+p+(siteUrl.endsWith('.pages.dev')?'':'.html');
 const links=[];
 for(const [entryId,id] of candidates){
  const e=report.entries.find(x=>x.id===entryId),p='/parking/'+id;
  const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(e.title)} | トメスポ</title><meta name="description" content="${esc(e.title)}の利用条件・出典付き参考情報。私有電動キックボードの受入は要確認。"><link rel="canonical" href="${canonical(p)}"><link rel="stylesheet" href="/search-pages.css"><link rel="icon" href="/icon.svg"></head><body><header><a href="/">トメスポ <small>Tomespot</small></a><nav><a href="/toshima-parking.html">豊島区・池袋の駐輪場</a></nav></header><main><h1>${esc(e.title)}</h1><p>${esc(e.address)}</p><h2>電動キックボード（特定小型）</h2>${referenceHTML({referenceEvidence:[e]})}<p>時間貸しでの私有車の受入、指定区画、固定方法は未確認です。</p><p><a href="/toshima-parking.html">豊島区の駐輪場一覧へ</a></p></main></body></html>`;
  fs.writeFileSync(path.join(output,'parking',id+'.html'),html);
  links.push(`<li><a href="${p}.html">${esc(e.title)}</a> — 参考・受入要確認</li>`);
 }
 const directory=path.join(output,'toshima-parking.html');
 fs.writeFileSync(directory,fs.readFileSync(directory,'utf8').replace('</main>','<section><h2>受入確認中の施設</h2><ul>'+links.join('')+'</ul></section></main>'));
 const oldGuide=path.join(output,'ikebukuro-kickboard-parking.html');
 if(fs.existsSync(oldGuide))fs.unlinkSync(oldGuide);
 fs.copyFileSync(path.join(root,'source/public/_redirects'),path.join(output,'_redirects'));
 const sitemap=path.join(output,'sitemap.xml');
 fs.writeFileSync(sitemap,fs.readFileSync(sitemap,'utf8').replace('</urlset>',candidates.map(([,id])=>'<url><loc>'+canonical('/parking/'+id)+'</loc></url>').join('')+'</urlset>'));
}
