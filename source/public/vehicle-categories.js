/* Four display categories derived from retained source profiles. */
(function(root){
 const types=['bicycle','privateElectricScooter','moped','motorcycle'];
 const cache=new WeakMap();
 const moped=/原付|原動機付|原动机付|(?<!\d)50cc以下/;
 const moto=/自動二輪|自動二轮|自动二轮|普通二輪|大型|オートバイ|二輪車全般|バイク[中大]|(?<!\d)(?:125cc超|126cc以上|(?:250|400)cc以下)|50cc(?:超|を超える)/;
 const text=t=>[t.sourceVehicleClass,t.sourceVehicleZone,t.sourceVehicleZoneEligibility,t.sourceVehicle,t.vehicleFloorRaw].filter(Boolean).join(' ').normalize('NFKC');
 const regular=['confirmed_application_required','confirmed_annual_registration_required','not_monthly_annual_registration_only'];
 const empty=()=>({admissionStatus:'unknown',temporaryStatus:'unverified',regularStatus:'unverified',classesRaw:[],tariffs:[],sources:[],currentConditionsRaw:[]});
 const normalize=q=>({...empty(),...q,classesRaw:Array.isArray(q?.classesRaw)?q.classesRaw:q?.classesRaw?[q.classesRaw]:[],currentConditionsRaw:Array.isArray(q?.currentConditionsRaw)?q.currentConditionsRaw:[],sources:q?.sources||[]});
 function derive(m,kind){
  if(!m)return empty();
  const c=m.categoryClassification,group=c?.groups?.[kind];
  let admissionStatus=m.admissionStatus==='rejected'?'rejected':group?.status==='confirmed'?'confirmed':'unknown';
  if(kind==='motorcycle'&&c?.disposition==='moped')admissionStatus='rejected';
  if(m.scopeAudit?.status==='car_only_evidence')admissionStatus='unknown';
  const only=c?.disposition===kind;
  const selected=(m.classes||[]).filter(x=>typeof x==='object'&&x.admissionStatus==='confirmed'&&(kind==='moped'?x.classCode==='原':['中','大','特'].includes(x.classCode)));
  const classTariffs=selected.flatMap(x=>(x.tariffs||[]).map(t=>({...t,sourceVehicle:t.sourceVehicle||x.scope||x.classCode})));
  const scopedTariffs=(m.tariffs||[]).filter(t=>{const label=text(t);return kind==='moped'?moped.test(label)&&!moto.test(label):moto.test(label)&&!moped.test(label);});
  const data=kind==='moped'?c?.mopedData:null;
  const tariffs=data?.tariffs?.length?data.tariffs:classTariffs.length?classTariffs:scopedTariffs.length?scopedTariffs:only?m.tariffs||[]:[];
  const mode=field=>{
   if(data?.[field])return data[field];
   if(only)return m[field]||'unverified';
   const values=[...new Set(selected.map(x=>x[field]).filter(Boolean))];if(values.length===1)return values[0];
   const matching=tariffs.filter(t=>field==='temporaryStatus'?t.mode==='temporary'||t.temporary?.status==='confirmed':['regular','annual_registration'].includes(t.mode)||t.regular?.status==='confirmed');
   if(matching.length)return field==='temporaryStatus'?'confirmed':matching.every(t=>t.mode==='annual_registration')?'confirmed_annual_registration_required':'confirmed_application_required';
   return 'unverified';
  };
  const publishedFeesRaw=data?data.publishedFeesRaw||'':only?m.publishedFeesRaw||'':'';
  const temporaryStatus=admissionStatus==='confirmed'?mode('temporaryStatus'):'unverified',regularStatus=admissionStatus==='confirmed'?mode('regularStatus'):'unverified';
  return {...m,category:kind,sourceCategory:'motorcycle',admissionStatus,classes:[],classesRaw:group?.evidenceRaw||[],scope:undefined,tariffs:admissionStatus==='confirmed'?tariffs:[],publishedFeesRaw:admissionStatus==='confirmed'?publishedFeesRaw:'',temporaryStatus,regularStatus,annualRegistrationStatus:regular.includes(regularStatus)&&regularStatus.includes('annual')?'confirmed_application_required':undefined,includeInVehicleResults:false};
 }
 function profiles(row){if(!row)return Object.fromEntries(types.map(k=>[k,empty()]));if(cache.has(row))return cache.get(row);const result={bicycle:normalize(row.bicycle),privateElectricScooter:normalize(row.privateElectricScooter),moped:normalize(derive(row.motorcycle,'moped')),motorcycle:normalize(derive(row.motorcycle,'motorcycle'))};cache.set(row,result);return result;}
 root.TomespotVehicleCategories={types,profiles,derive};
})(globalThis);
