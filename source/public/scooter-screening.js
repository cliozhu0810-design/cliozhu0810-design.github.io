/* Shared by the data preparation script and map. Explicit bans override moped defaults. */
(function(root){
 const vehicle=/(?:電動)?キックボード|特定小型(?:原動機付自転車)?|电动滑板车|電動滑板車|(?:electric\s+|e[- ]?)scooters?/i;
 const ban=/不可|禁止|対象外|利用できません|駐車できません|駐輪できません|お断り|受け付けません|不允许|不允許|不能停|不得停|禁止停|not\s+(?:allowed|permitted|accepted)|prohibited|not\s+accept(?:ed)?/i;
 function strings(value){
  if(typeof value==='string')return [value];
  if(Array.isArray(value))return value.flatMap(strings);
  if(!value||typeof value!=='object')return [];
  return Object.entries(value).filter(([k])=>!['sources','source','url','categoryClassification','mopedFallback'].includes(k)).flatMap(([,v])=>strings(v));
 }
 function explicitBan(row){
  if(row?.privateElectricScooter?.admissionStatus==='rejected')return true;
  return [row?.privateElectricScooter,row?.motorcycle].flatMap(strings).some(text=>text.normalize('NFKC').split(/[。；;\n]/).some(part=>{
   // An uncertainty note or "cannot infer permission" is not an operator prohibition.
   const clean=part.replace(/不能(?:直接)?(?:推定|认定|認定|视为|視為|自动扩展|自動擴展)|不可推定|禁止とは(?:限らない|断定できない)|not prohibited|not necessarily prohibited/gi,'');
   const v=vehicle.exec(clean),b=ban.exec(clean);return !!v&&!!b&&Math.abs(v.index-b.index)<65;
  }));
 }
 function eligiblePlace(place){return !place||place.displayEligible!==false&&(!place.canonicalFacilityId||place.canonicalFacilityId===place.id);}
 root.TomespotScooterScreening={explicitBan,eligiblePlace};
})(globalThis);
