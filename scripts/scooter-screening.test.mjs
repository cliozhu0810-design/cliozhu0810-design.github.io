import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../source/public/scooter-screening.js';
const policy=globalThis.TomespotScooterScreening;
const v=JSON.parse(fs.readFileSync(new URL('../source/public/vehicle-data.json',import.meta.url)));
const places=JSON.parse(fs.readFileSync(new URL('../source/public/parking.json',import.meta.url))).places;
test('explicit scooter bans in either vehicle profile override moped association',()=>{
 const q={admissionStatus:'unknown'},m={admissionStatus:'confirmed',facilityMatched:true,classesRaw:['原付50cc以下'],temporaryStatus:'confirmed'};
 const c=vm.createContext({TomespotScooterScreening:policy,document:{getElementById:()=>null},localStorage:{getItem:()=>null}});
 vm.runInContext(fs.readFileSync(new URL('../source/public/app.js',import.meta.url),'utf8').split("$('search').addEventListener")[0],c);
 c.policy=v.scooterDefaultPolicy;vm.runInContext('vehicleData={scooterDefaultPolicy:policy}',c);
 for(const text of ['電動キックボードは利用できません','特定小型原動機付自転車は対象外','電動キックボードの駐輪をお断りします','禁止停放电动滑板车','Electric scooters are not allowed']){
  for(const target of ['privateElectricScooter','motorcycle']){
   const row={privateElectricScooter:{...q},motorcycle:{...m}};row[target].currentConditionsRaw=[text];assert.equal(policy.explicitBan(row),true,text);c.row=row;
   assert.equal(vm.runInContext('mopedDefaultProfile(row).includeInVehicleResults',c),false,text);
   assert.equal(vm.runInContext('mopedDefaultProfile(row).admissionStatus',c),'rejected',text);
  }
 }
 for(const text of ['特定小型の利用可否は未確認','原付可停，不能推定电动滑板车已获官方许可','電動キックボードが禁止とは断定できない'])assert.equal(policy.explicitBan({privateElectricScooter:{...q,evidence:[text]},motorcycle:m}),false,text);
});
test('prepared associations omit banned, hidden and canonical duplicate records',()=>{
 const byId=new Map(places.map(p=>[p.id,p])),seen=new Set();let count=0;
 for(const [id,row]of Object.entries(v.profiles)){
  if(!row.privateElectricScooter?.mopedFallback)continue;
  count++;assert.equal(policy.explicitBan(row),false,id);const p=byId.get(id);assert.equal(policy.eligiblePlace(p),true,id);
  if(p){const identity=p.canonicalFacilityId||p.id;assert.ok(!seen.has(identity),id);seen.add(identity);}
 }
 assert.equal(count,v.motorcycleClassification.mopedFallbackProfiles);
 assert.equal(v.profiles['toshima-utsusemi-moped'].privateElectricScooter.mopedFallback,undefined);
 assert.equal(policy.explicitBan(v.profiles['jks-00800']),false);
 assert.equal(policy.eligiblePlace({id:'alias',canonicalFacilityId:'real'}),false);
 assert.equal(policy.eligiblePlace({id:'hidden',displayEligible:false}),false);
 assert.equal(policy.eligiblePlace({id:'real',canonicalFacilityId:'real'}),true);
});
