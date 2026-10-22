import fs from 'node:fs';
import {vehicleEvidenceParts} from './motorcycle-evidence.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const list=x=>Array.isArray(x)?x:x?[x]:[];
const normalized=x=>String(x||'').normalize('NFKC').replace(/CC/g,'cc');

export function auditMotorcycleScope(m,place,sourceCheck){
 const labels=[...list(m.classesRaw),m.scope,...list(m.classes).filter(c=>c.admissionStatus==='confirmed').map(c=>c.scope),...list(m.tariffs).flatMap(t=>[t.sourceVehicleClass,t.sourceVehicleZone,t.sourceVehicle])].filter(x=>typeof x==='string').map(normalized);
 const conditions=list(m.currentConditionsRaw).map(normalized);
 const positive=labels.flatMap(vehicleEvidenceParts);
 const hardCaps=conditions.flatMap(s=>[...s.matchAll(/排気量上限\s*\(cc\)\s*:\s*(\d+)|(?:排気量|バイク制限)[^。\n]{0,15}?(\d+)\s*cc(?:以下|まで|迄)/g)].map(x=>Number(x[1]||x[2])));
 const explicitLarge=positive.filter(s=>/大型(?:二輪|バイク|区画|枠|\d+区画)|中大型|排気量(?:制限|上限)(?:なし|無し)|全排気量/.test(s));
 const over125=positive.filter(s=>/(?:125\s*cc(?:超|超過)|126\s*cc以上|バイク大\[)/.test(s));
 const labelCaps=positive.flatMap(s=>[...s.matchAll(/(?:<=\s*)?(\d+)\s*cc(?:以下|以内|まで|迄)|<=\s*(\d+)\s*cc/g)].map(x=>Number(x[1]||x[2])));
 const caps=hardCaps.length?hardCaps:!explicitLarge.length&&!over125.length?labelCaps:[];
 const ceiling=caps.length?Math.max(...caps):null;
 const mopedOnly=m.categoryClassification?.disposition==='moped';
 const carOnly=positive.some(s=>/四輪専用|自動車専用|普通車専用/.test(s))&&!positive.some(s=>/バイク|二輪|原付|オートバイ/.test(s));
 let status='unconfirmed_large';
 if(m.admissionStatus==='rejected')status='not_accepted';
 else if(m.admissionStatus!=='confirmed')status='admission_unconfirmed';
 else if(carOnly)status='car_only_evidence';
 else if((ceiling!==null&&ceiling<=400)||mopedOnly||positive.some(s=>/中型バイクまで/.test(s)))status='restricted_to_smaller_classes';
 else if(explicitLarge.length)status='operator_large_or_unrestricted';
 else if(over125.length)status='over125_upper_limit_unconfirmed';
 const excluded=place?.displayEligible===false||!!(place?.canonicalFacilityId&&place.canonicalFacilityId!==place.id);
 const warnings=[];
 if(excluded)warnings.push('hidden_or_canonical_alias');
 if(!place)warnings.push('not_mapped');
 if(!m.facilityMatched)warnings.push('facility_match_unconfirmed');
 if(sourceCheck?.result==='fetch_unavailable')warnings.push('source_recheck_unavailable');
 if(sourceCheck?.result?.includes('pending'))warnings.push('vehicle_specific_fee_scope_pending');
 if(sourceCheck?.result?.startsWith('mixed_car'))warnings.push('shared_facility_keep_vehicle_specific_zone_and_fee');
 if(status==='unconfirmed_large')warnings.push('generic_motorcycle_admission_does_not_confirm_large_fit');
 const canRecommend=status==='operator_large_or_unrestricted'&&!excluded&&!!place&&!!m.facilityMatched;
 return {version:1,auditedOn:'2026-10-22',sourceEvidenceChecked:m.checked||null,status,recommendForLargeMotorcycles:canRecommend,basis:explicitLarge.length?'operator_large_label_or_explicit_unrestricted_scope':over125.length?'over125_without_full_large_scope':mopedOnly?'moped_only':ceiling!==null?'published_displacement_ceiling':'existing_admission_evidence',displacementCeilingCC:ceiling,evidenceRaw:[...new Set([...explicitLarge,...over125,...(ceiling!==null?conditions.filter(s=>/cc/.test(s)):[])])],warnings};
}

export function runScopeAudit(root){
 const dir=path.join(root,'source/public'),read=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
 const save=(f,x)=>fs.writeFileSync(path.join(dir,f),JSON.stringify(x,null,2).replace(/\n/g,'\r\n')+'\r\n');
 const v=read('vehicle-data.json'),parking=read('parking.json'),places=new Map(parking.places.map(p=>[p.id,p]));
 const checks=JSON.parse(fs.readFileSync(path.join(root,'scripts/motorcycle-source-checks.json'),'utf8'));
 const checkById=new Map(checks.checks.filter(c=>c.id).map(c=>[c.id,c]));
 const metadata=new Map(places),reports=fs.readdirSync(dir).filter(f=>f.endsWith('-review.json'));
 const walk=(node,visit)=>{if(!node||typeof node!=='object')return;visit(node);for(const [key,value]of Object.entries(node))if(key!=='profiles'){if(Array.isArray(value))value.forEach(x=>walk(x,visit));else if(value&&typeof value==='object')walk(value,visit);}};
 for(const file of reports)walk(read(file),node=>{if(node.id&&node.name&&!metadata.has(node.id))metadata.set(node.id,node);});
 const records=[];
 for(const[id,row]of Object.entries(v.profiles)){
  const m=row.motorcycle;if(!m)continue;const a=auditMotorcycleScope(m,places.get(id),checkById.get(id));m.scopeAudit=a;
  const p=metadata.get(id);records.push({id,name:p?.name||id,region:p?.ward||p?.prefecture||p?.city||'not_mapped',mapped:places.has(id),visible:!!places.get(id)&&places.get(id).displayEligible!==false,admissionStatus:m.admissionStatus,...a,sources:m.sources||[]});
 }
 for(const file of reports){const report=read(file);let changed=false;walk(report,node=>{if(node.id&&node.profiles?.motorcycle&&v.profiles[node.id]?.motorcycle){node.profiles.motorcycle.scopeAudit=structuredClone(v.profiles[node.id].motorcycle.scopeAudit);changed=true;}});if(changed)save(file,report);}
 const tally=rows=>Object.fromEntries(Object.entries(Object.groupBy(rows,x=>x.status)).map(([k,r])=>[k,r.length]));
 const names=new Map();for(const r of records.filter(r=>r.visible&&r.admissionStatus==='confirmed')){const key=normalized(r.name).replace(/[\s・()（）]/g,'');if(!names.has(key))names.set(key,[]);names.get(key).push(r.id);}
 const duplicateNameCandidates=[...names.values()].filter(a=>a.length>1);
 const audit={checkedOn:'2026-10-22',scope:['東京都','埼玉県','千葉県','神奈川県'],method:'All existing motorcycle profiles screened from stored evidence; targeted official source rechecks listed separately. Not a fresh source visit for every record.',definitions:{operator_large_or_unrestricted:'Operator explicitly labels large motorcycle spaces or unlimited displacement; fit and mode conditions still apply. Not a legal vehicle category.',over125_upper_limit_unconfirmed:'Over 125cc acceptance alone does not confirm every large motorcycle.',restricted_to_smaller_classes:'Moped-only, published displacement ceiling up to 400cc, or medium-only conditions; exclude from large-bike recommendations.',unconfirmed_large:'Motorcycle acceptance exists, but large-bike scope is not established.'},summary:{profiles:records.length,acceptedProfiles:records.filter(r=>r.admissionStatus==='confirmed').length,all:tally(records),accepted:tally(records.filter(r=>r.admissionStatus==='confirmed')),largeRecommendations:records.filter(r=>r.recommendForLargeMotorcycles).length,duplicateNameCandidates},officialSourceRechecks:checks,records};
 v.motorcycleScopeAudit={checkedOn:audit.checkedOn,summary:audit.summary,report:'motorcycle-scope-audit.json'};save('vehicle-data.json',v);save('motorcycle-scope-audit.json',audit);
 return audit;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');console.log(runScopeAudit(root).summary);}
