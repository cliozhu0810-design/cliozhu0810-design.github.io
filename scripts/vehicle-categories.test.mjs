import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {categoryProfiles,vehicleCategories} from './vehicle-categories.mjs';
const read=f=>JSON.parse(fs.readFileSync(new URL('../source/public/'+f,import.meta.url)));
test('mopeds and motorcycles have independent admission, class-specific fees and modes',()=>{
 const source={admissionStatus:'confirmed',facilityMatched:true,temporaryStatus:'confirmed',regularStatus:'confirmed_application_required',publishedFeesRaw:'DO NOT COPY MIXED FEES',categoryClassification:{disposition:'mixed',groups:{moped:{status:'confirmed',evidenceRaw:['原付50cc以下']},motorcycle:{status:'confirmed',evidenceRaw:['自動二輪125cc超']}},mopedData:{temporaryStatus:'confirmed',regularStatus:'not_offered',publishedFeesRaw:'原付100円',tariffs:[]}},classes:[{classCode:'大',scope:'125cc超',admissionStatus:'confirmed',temporaryStatus:'not_offered',regularStatus:'confirmed_application_required',tariffs:[{mode:'regular',amountJPY:6000,sourceVehicle:'自動二輪'}]}]};
 const row={motorcycle:source};const views=categoryProfiles(row);
 assert.equal(views.moped.publishedFeesRaw,'原付100円');assert.equal(views.moped.regularStatus,'not_offered');
 assert.equal(views.motorcycle.publishedFeesRaw,'');assert.equal(views.motorcycle.temporaryStatus,'not_offered');assert.equal(views.motorcycle.tariffs[0].amountJPY,6000);
 assert.equal(source.publishedFeesRaw,'DO NOT COPY MIXED FEES');assert.equal(row.moped,undefined);
});
test('four-category map excludes moped-only records from motorcycle results, preserving scooter references',()=>{
 const v=read('vehicle-data.json'),parking=read('parking.json'),l=read('locales.json');
 const elements={search:{value:''},ward:{value:''},unknown:{checked:false}};
 const c=vm.createContext({TomespotVehicleCategories:vehicleCategories,URL,localStorage:{getItem:()=>null},document:{getElementById:id=>elements[id]}});
 vm.runInContext(fs.readFileSync(new URL('../source/public/app.js',import.meta.url),'utf8').split("$('search').addEventListener")[0],c);
 Object.assign(c,{v,parking,l});vm.runInContext('vehicleData=v;dataset=parking;messages=l;state.places=parking.places;',c);
 const ids=vehicle=>{c.vehicle=vehicle;return JSON.parse(vm.runInContext('state.vehicle=vehicle;JSON.stringify(filtered().map(p=>p.id))',c));};
 const moped=ids('moped'),motorcycle=ids('motorcycle');assert.ok(moped.length>100);assert.ok(motorcycle.length>100);
 assert.ok(moped.includes('21108'));assert.ok(!motorcycle.includes('21108'));
 for(const id of motorcycle)assert.notEqual(v.profiles[id]?.motorcycle.categoryClassification.disposition,'moped',id);
 assert.ok(ids('privateElectricScooter').includes('jks-00800'));
 for(const lang of ['ja','zh-Hans','zh-Hant','en']){assert.ok(l.mopedLabel[lang]);assert.ok(l.motorcycleLabel[lang]);assert.notEqual(l.mopedLabel[lang],l.motorcycleLabel[lang]);}
 assert.deepEqual([...vehicleCategories.types],['bicycle','privateElectricScooter','moped','motorcycle']);
});
test('generic motorcycle scope remains unconfirmed after separation and fees are not copied across vehicles',()=>{
 const v=read('vehicle-data.json');
 assert.equal(categoryProfiles(v.profiles['coinpark-nishishimbashi1-4']).motorcycle.admissionStatus,'unknown');
 assert.equal(categoryProfiles(v.profiles['21108']).moped.admissionStatus,'confirmed');
 assert.equal(categoryProfiles(v.profiles['21108']).motorcycle.admissionStatus,'rejected');
 const html=JSON.parse(fs.readFileSync(new URL('../source/app/map-html.ts',import.meta.url),'utf8').trim().replace(/^export const html = /,'').replace(/;$/,''));
 const select=html.match(/<select id="vehicle"[^>]*>([\s\S]*?)<\/select>/)[1];
 assert.deepEqual([...select.matchAll(/value="([^"]+)"/g)].map(x=>x[1]),vehicleCategories.types);
 assert.ok(html.indexOf('vehicle-categories.js')<html.indexOf('src="app.js"'));
});
