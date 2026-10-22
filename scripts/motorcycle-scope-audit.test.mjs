import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditMotorcycleScope} from './motorcycle-scope-audit.mjs';
import {classifyMotorcycle} from './motorcycle-classification.mjs';
const make=classesRaw=>({admissionStatus:'confirmed',facilityMatched:true,classesRaw,currentConditionsRaw:[]});
test('exclusions and unconfirmed large-bike statements cannot become affirmative motorcycle evidence',()=>{
 const excluded=make(['原付（50cc以下・三輪バイク及び屋根付等大型バイクを除く）']);
 assert.equal(classifyMotorcycle(excluded).disposition,'moped');
 assert.notEqual(auditMotorcycleScope(excluded).status,'operator_large_or_unrestricted');
 const uncertain=make(['原付（新基準原付一種以内の制限あり）。通常の原付二種125cc・大型二輪は今回受入確定としていません。']);
 assert.equal(classifyMotorcycle(uncertain).disposition,'moped');
 assert.notEqual(auditMotorcycleScope(uncertain).status,'operator_large_or_unrestricted');
 const mixed=make(['原付（50cc以下・三輪バイク及び屋根付等大型バイクを除く）自動二輪（50cc以上・三輪バイク及び屋根付等大型バイクを含む）']);
 assert.equal(classifyMotorcycle(mixed).disposition,'mixed');
 assert.equal(auditMotorcycleScope(mixed).status,'operator_large_or_unrestricted');
});
test('large scope requires vehicle evidence, retains displacement ceilings and excludes aliases',()=>{
 assert.equal(auditMotorcycleScope(make(['大型車・SUV（四輪専用）'])).status,'car_only_evidence');
 assert.equal(auditMotorcycleScope(make(['自動二輪125cc超'])).status,'over125_upper_limit_unconfirmed');
 assert.equal(classifyMotorcycle(make(['バイク250cc以下'])).disposition,'motorcycle');
 for(const cap of [50,125,250,400]){
  const m=make(['バイク・二輪車全般']);m.currentConditionsRaw=['排気量上限 (cc): '+cap];
  const a=auditMotorcycleScope(m);assert.equal(a.status,'restricted_to_smaller_classes');assert.equal(a.displacementCeilingCC,cap);
 }
 const large=make(['大型2区画：幅1,000mm×長さ2,300mm。']);
 assert.equal(auditMotorcycleScope(large,{id:'x'}).recommendForLargeMotorcycles,true);
 for(const p of [undefined,{id:'x',displayEligible:false},{id:'x',canonicalFacilityId:'real'}])assert.equal(auditMotorcycleScope(large,p).recommendForLargeMotorcycles,false);
 assert.equal(auditMotorcycleScope(make(['バイク（排気量上限の掲載なし）']),{id:'x'}).recommendForLargeMotorcycles,false);
});
test('whole-region audit covers every profile and preserves vehicle-specific evidence in mixed facilities',()=>{
 const load=f=>JSON.parse(fs.readFileSync(new URL('../source/public/'+f,import.meta.url)));
 const v=load('vehicle-data.json'),a=load('motorcycle-scope-audit.json'),byId=new Map(a.records.map(r=>[r.id,r]));
 assert.equal(a.records.length,Object.keys(v.profiles).length);assert.equal(a.records.length,2464);
 assert.equal(a.summary.acceptedProfiles,850);assert.deepEqual(a.summary.duplicateNameCandidates,[]);
 for(const[id,row]of Object.entries(v.profiles)){assert.deepEqual(row.motorcycle.scopeAudit,Object.fromEntries(Object.keys(row.motorcycle.scopeAudit).map(k=>[k,byId.get(id)[k]])));}
 for(const id of ['21108','15128','yk-14102-pd-PK000068358','moto-177f9a73f279be','moto-d5fe98a0fb4dd6'])assert.equal(byId.get(id).recommendForLargeMotorcycles,false,id);
 assert.equal(byId.get('yk-14102-pd-PK000068358').displacementCeilingCC,250);
 assert.equal(byId.get('inzai-akippa-382dc1cf8680').admissionStatus,'confirmed');
 assert.ok(byId.get('inzai-akippa-382dc1cf8680').warnings.includes('shared_facility_keep_vehicle_specific_zone_and_fee'));
 assert.equal(byId.get('coinpark-nishishimbashi1-4').status,'unconfirmed_large');
 assert.ok(!v.profiles['coinpark-nishishimbashi1-4'].motorcycle.publishedFeesRaw.includes('15分300円'));
 assert.equal(byId.get('ecolo-shimbashi9-4418').recommendForLargeMotorcycles,false);
 assert.ok(byId.get('ecolo-shimbashi9-4418').warnings.includes('vehicle_specific_fee_scope_pending'));
});
