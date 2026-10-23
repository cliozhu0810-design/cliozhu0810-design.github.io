import fs from 'node:fs';
import path from 'node:path';
import {categoryProfiles} from './vehicle-categories.mjs';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories=[['moped','原付'],['motorcycle','バイク']];

export function addVehicleCategoryPages({root,output,siteUrl}) {
  const parking=JSON.parse(fs.readFileSync(path.join(root,'source/public/parking.json'),'utf8'));
  const vehicles=JSON.parse(fs.readFileSync(path.join(root,'source/public/vehicle-data.json'),'utf8'));
  const suffix=siteUrl.endsWith('.pages.dev')?'':'.html';
  const navigation='<nav class="ward-nav" aria-label="車種別の駐輪場"><a href="/bicycle-parking.html">自転車の駐輪場</a><a href="/kickboard-parking.html">電動キックボードの駐輪場</a>'+categories.map(([kind,label])=>`<a href="/${kind}-parking.html">${label}の駐輪場</a>`).join('')+'</nav>';
  const urls=[];
  for(const [kind,label] of categories) {
    const canonical=siteUrl+'/'+kind+'-parking'+suffix;
    const title=label+'の駐輪場｜料金・利用条件を探す｜トメスポ';
    const description=label+'の駐輪場を地域別に検索。東京を中心に、埼玉・千葉・神奈川の一部施設を掲載。施設ごとの料金、車両条件、公式案内を確認できます。';
    const places=parking.places.filter(p=>p.displayEligible!==false&&!p.discoveryOnly&&(!p.canonicalFacilityId||p.canonicalFacilityId===p.id)&&categoryProfiles(vehicles.reviewedProfiles?.[p.id]||vehicles.profiles[p.id])[kind].admissionStatus==='confirmed');
    const wards=[...new Set(places.map(p=>p.ward))].sort((a,b)=>a.localeCompare(b,'ja'));
    const groups=wards.map((ward,i)=>`<section id="area-${i}"><h2>${escape(ward)}</h2><ul>${places.filter(p=>p.ward===ward).map(p=>`<li data-place="${escape(p.id)}"><a href="${fs.existsSync(path.join(output,'parking',p.id+'.html'))?'/parking/'+escape(p.id)+'.html#'+kind:'/?vehicle='+kind+'&amp;place='+encodeURIComponent(p.id)}">${escape(p.name)}</a><p>${escape(p.address)}</p><a href="/?vehicle=${kind}&amp;place=${encodeURIComponent(p.id)}">${label}の料金・利用条件を地図で確認</a></li>`).join('')}</ul></section>`).join('');
    const scope=kind==='moped'?'原付としての受入条件を掲載しています。排気量・定格出力・車両区分を施設ごとに確認してください。バイクの受入とは別に扱っています。':'原付のみ対応の施設は、この一覧には含めていません。バイクの排気量・車幅・車長などの受入条件を施設ごとに確認してください。';
    const schema={'@context':'https://schema.org','@type':'CollectionPage',name:label+'の駐輪場',description,url:canonical};
    const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(canonical)}"><link rel="canonical" href="${escape(canonical)}"><link rel="stylesheet" href="/search-pages.css"><link rel="icon" href="/icon.svg"><script type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script></head><body><header><a href="/">トメスポ</a><nav><a href="/areas/index.html">地域・駅から探す</a><a href="/about.html">トメスポについて</a></nav></header><main><h1>${label}の駐輪場</h1><p>${escape(description)}</p><p>${scope}</p><p><a href="/?vehicle=${kind}">${label}の駐輪場を地図で探す</a></p>${navigation}<h2>地域別の駐輪場 ${places.length}施設</h2><p>現在の空き状況は提供していません。出発前に各施設の最新の公式案内をご確認ください。</p><nav class="ward-nav" aria-label="地域別の駐輪場">${wards.map((ward,i)=>`<a href="#area-${i}">${escape(ward)}</a>`).join('')}</nav>${groups}${navigation}</main></body></html>`;
    fs.writeFileSync(path.join(output,kind+'-parking.html'),html);
    urls.push(canonical);
  }
  // Existing motorcycle URLs remain valid; navigation now offers both categories.
  function updateLinks(dir) {
    for(const item of fs.readdirSync(dir,{withFileTypes:true})) {
      const file=path.join(dir,item.name);
      if(item.isDirectory()){updateLinks(file);continue;}
      if(!file.endsWith('.html'))continue;
      const before=fs.readFileSync(file,'utf8');
      if(before.includes('href="/moped-parking.html"'))continue;
      const after=before.replace(/<a\b([^>]*href="\/motorcycle-parking(?:\.html)?"[^>]*)>[^<]*<\/a>/g,'<a href="/moped-parking.html">原付の駐輪場</a><a$1>バイクの駐輪場</a>');
      if(after!==before)fs.writeFileSync(file,after);
    }
  }
  updateLinks(output);
  const sitemap=path.join(output,'sitemap.xml');
  const xml=fs.readFileSync(sitemap,'utf8');
  const existing=new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]));
  fs.writeFileSync(sitemap,xml.replace('</urlset>',urls.filter(u=>!existing.has(u)).map(u=>`<url><loc>${escape(u)}</loc></url>`).join('')+'</urlset>'));
}
