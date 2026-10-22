import fs from 'node:fs';
import {vehicleEvidenceParts} from './motorcycle-evidence.mjs';
import '../source/public/scooter-screening.js';
const {explicitBan,eligiblePlace}=globalThis.TomespotScooterScreening;
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const negative=/未確認|未确认|尚未|対象外|不可|禁止|対応していません|ではありません|ではない|意味しません|○ではない|不扩展|不表示|不自动扩展/;
const mopedWord=/原付|原動機付|原动机付|原動機付き/;
const upper125=/(?<!\d)125\s*cc(?:以下|以内|まで)|<=125cc/;
const lower50=/50cc(?:超|以上|を超える)|50cc超|(?:51|126)cc以上|51[–〜～-]125/;
const upper50=/(?<!\d)50cc以下|<=50cc|仅50cc/;
const restricted=/白.?ナンバー|白色?号牌|白牌|白ナンバー|白色ナンバー|白ナンバ|白ナンバー|4[.．]0?\s*k[wW]|4\s*k[wW]|4\.0kW|最高出力|最高输出|新基[準准]|第一種|一種/;
const motorcycleWord=/自動二輪|自動二轮|自动二轮|普通二輪|普通二轮|大型(?:二輪|バイク|区画|\d+区画)|二輪車全般|オートバイ|原付から自動二輪/;

export function classifyMotorcycle(m){
 const raw=[...(Array.isArray(m.classesRaw)?m.classesRaw: m.classesRaw?[m.classesRaw]:[]),...(!m.classesRaw&&m.scope?[m.scope]:[])];
 const structured=(m.classes||[]).filter(c=>typeof c==='object'&&c.admissionStatus==='confirmed');
 const tariffLabels=(m.tariffs||[]).flatMap(t=>[t.sourceVehicleClass,t.sourceVehicleZone,t.sourceVehicleZoneEligibility,t.sourceVehicle,t.vehicleFloorRaw].filter(x=>typeof x==='string'));
 const labels=[...new Set([...raw,...structured.map(c=>c.scope||c.classCode),...tariffLabels].filter(s=>typeof s==='string'&&s.trim()))];
 let mop=false,moto=false;const evidence={moped:[],motorcycle:[]};
 const reasons=[];
 for(const label of labels){
  for(const part of vehicleEvidenceParts(label)){
   if(negative.test(part))continue;
   const limited=restricted.test(part);
   const up50=upper50.test(part)||/バイク小/.test(part),up125=upper125.test(part);
   const hasMoped=mopedWord.test(part.replace(/排除官方原类新基准原付/g,''))||up50||up125&&!limited;
   const higherCeiling=[...part.matchAll(/(\d+)cc(?:以下|以内|まで)/g)].some(x=>Number(x[1])>125);
   const hasMoto=lower50.test(part)||(!limited&&(motorcycleWord.test(part)||higherCeiling||/125cc(?:超|以上|超過)|バイク[中大]|第二種/.test(part)||up125&&!up50))||/自動二輪車?（?125cc以下|普通自動二輪/.test(part);
   if(hasMoped){mop=true;evidence.moped.push(part);}
   if(hasMoto){moto=true;evidence.motorcycle.push(part);}
  }
 }
 for(const c of structured){if(c.classCode==='原'){mop=true;evidence.moped.push(c.scope||'原');}if(['中','大','特'].includes(c.classCode)){moto=true;evidence.motorcycle.push(c.scope||c.classCode);}}
 if(labels.some(s=>restricted.test(s)))reasons.push('retain_plate_power_and_new_standard_conditions');
 const status=supported=>m.admissionStatus==='rejected'?'rejected':m.admissionStatus==='confirmed'&&supported?'confirmed':'unknown';
 const groups={moped:{status:status(mop),evidenceRaw:[...new Set(evidence.moped)]},motorcycle:{status:status(moto),evidenceRaw:[...new Set(evidence.motorcycle)]}};
 const disposition=m.admissionStatus==='rejected'?'rejected':groups.moped.status==='confirmed'&&groups.motorcycle.status==='confirmed'?'mixed':groups.moped.status==='confirmed'?'moped':groups.motorcycle.status==='confirmed'?'motorcycle':'unspecified';
 const selected=structured.filter(c=>c.classCode==='原'||mopedWord.test(c.scope||'')&&!/原类新基准原付/.test(c.scope||''));
 const groupTariffs=selected.flatMap(c=>c.tariffs||[]);
 const explicitMopedTariffs=(m.tariffs||[]).filter(t=>{const s=[t.sourceVehicleClass,t.sourceVehicleZone,t.sourceVehicle].filter(Boolean).join(' ');return mopedWord.test(s)&&!motorcycleWord.test(s);});
 const modes={temporaryStatus:'unverified',regularStatus:'unverified'};
 if(selected.length){for(const field of Object.keys(modes)){const statuses=[...new Set(selected.map(c=>c[field]).filter(Boolean))];if(statuses.length===1)modes[field]=statuses[0];}}
 else if(disposition==='moped'){for(const key of Object.keys(modes))modes[key]=m[key]||'unverified';}
 else if(explicitMopedTariffs.length){for(const field of Object.keys(modes)){const regular=field==='regularStatus';if(explicitMopedTariffs.some(t=>regular?['regular','annual_registration'].includes(t.mode):t.mode==='temporary'))modes[field]=regular?m.regularStatus:'confirmed';}}
 const result={version:1,classifiedOn:'2026-10-22',evidenceChecked:m.checked||null,disposition,groups};
 if(m.admissionStatus!=='confirmed')return result;
 Object.assign(result,{sourceLabelsRaw:labels,conditions:reasons});
 if(groups.moped.status==='confirmed')result.mopedData={...modes,tariffs:groupTariffs.length?groupTariffs:explicitMopedTariffs,publishedFeesRaw:disposition==='moped'&&!/自動二輪|50cc超|125cc超|中型|大型|126cc/.test(m.publishedFeesRaw||'')?m.publishedFeesRaw||'':'',hours:m.hours||'',hoursStatus:m.hoursStatus||'unverified',sources:m.sources||[],scopeStatus:disposition==='mixed'?'class_specific_only':'facility_category',newRegularApplications:m.newRegularApplications||null};
 return result;
}

export function updateClassification(root){
 const dir=path.join(root,'source/public');const load=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
 const save=(f,x)=>fs.writeFileSync(path.join(dir,f),JSON.stringify(x,null,2).replace(/\n/g,'\r\n')+'\r\n');
 const places=new Map(load('parking.json').places.map(p=>[p.id,p]));
 const v=load('vehicle-data.json');const summary={moped:0,motorcycle:0,mixed:0,unspecified:0,rejected:0};let fallback=0;
 for(const [id,row] of Object.entries(v.profiles)){if(!row.motorcycle)continue;const c=classifyMotorcycle(row.motorcycle);row.motorcycle.categoryClassification=c;summary[c.disposition]++;
  const q=row.privateElectricScooter;if(eligiblePlace(places.get(id))&&!explicitBan(row)&&q?.admissionStatus==='unknown'&&!q.includeInVehicleResults&&row.motorcycle.facilityMatched&&c.groups.moped.status==='confirmed'&&!/(?:電動キックボード|特定小型).{0,40}(?:不可|禁止|対象外|利用できません|駐車できません|受け付けません)/.test(JSON.stringify(q))){q.mopedFallback={basis:'user_moped_default_policy',classifiedOn:'2026-10-22',sourceProfile:'motorcycle.categoryClassification.mopedData',evidenceChecked:row.motorcycle.checked};fallback++;}else delete q?.mopedFallback;
 }
 v.motorcycleClassification={version:1,classifiedOn:'2026-10-22',categories:['moped','motorcycle'],summary,mopedFallbackProfiles:fallback,definition:'Source vehicle labels and explicit displacement ranges; not a blanket legal equivalence between every 125cc motorcycle and moped. Original plate, power, mode and fee conditions remain authoritative.'};
 for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('-review.json'))){const report=load(file);let changed=false;
  function walk(node){if(!node||typeof node!=='object')return;if(node.id&&node.profiles?.motorcycle&&v.profiles[node.id]?.motorcycle){node.profiles.motorcycle.categoryClassification=structuredClone(v.profiles[node.id].motorcycle.categoryClassification);if(node.profiles.privateElectricScooter){if(v.profiles[node.id].privateElectricScooter?.mopedFallback)node.profiles.privateElectricScooter.mopedFallback=structuredClone(v.profiles[node.id].privateElectricScooter.mopedFallback);else delete node.profiles.privateElectricScooter.mopedFallback;}changed=true;}for(const [key,value] of Object.entries(node))if(key!=='profiles')if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
  walk(report);if(changed)save(file,report);
 }
 save('vehicle-data.json',v);console.log({summary,mopedFallbackProfiles:fallback});return v.motorcycleClassification;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))updateClassification(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
