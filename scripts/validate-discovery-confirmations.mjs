import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=f=>JSON.parse(fs.readFileSync(new URL('../source/'+f,import.meta.url)));
const audit=read('data/google-coverage-audit.json'),review=read('data/discovery-confirmation-review.json'),parking=read('public/parking.json');
const originalIds=new Set(audit.additions.map(a=>a.record.id)),places=new Map(parking.places.map(p=>[p.id,p]));
assert.ok(['prepared_for_publication','published'].includes(review.publication));
assert.equal(review.queue.length,535);assert.equal(new Set(review.queue.map(r=>r.id)).size,535);
assert.deepEqual(new Set(review.queue.map(r=>r.id)),originalIds);
assert.equal(review.decisions.length,review.summary.manualDecisions);
assert.equal(Object.values(review.summary.statusCounts).reduce((a,b)=>a+b,0),535);
for(const d of review.decisions){
 assert.ok(originalIds.has(d.id));assert.ok(d.sources.length);
 for(const s of d.sources){assert.ok(/^https?:$/.test(new URL(s.url).protocol));assert.ok(s.checkedOn);}
 if(d.facilityIdentity==='confirmed')assert.ok(d.sources.some(s=>s.authority!=='google_listing_name'));
 if(d.status==='confirmed_duplicate'){assert.ok(places.has(d.canonicalFacilityId));assert.notEqual(d.id,d.canonicalFacilityId);assert.ok(d.evidence.length);}
 assert.equal(d.vehicleFacts?.privateElectricScooter?.admission,'unknown');
 for(const fact of Object.values(d.vehicleFacts||{}))if(fact.scooterDefaultCandidate)assert.equal(fact.officialScooterAcceptanceConfirmed,false);
 // Pending map identity must not be mistaken for a publishable coordinate correction.
 if(/address_conflict|zone_and_multiple/.test(d.position))assert.notEqual(d.status,'confirmed_facility');
}
const byId=new Map(review.decisions.map(d=>[d.id,d]));
assert.equal(byId.get('gmaps-unverified-d0ddf7d5bcde').feeStatus,'conflicting_display_requires_confirmation');
assert.equal(byId.get('gmaps-unverified-bf82b3317d6e').vehicleFacts.motorcycle.admission,'unknown');
assert.match(byId.get('gmaps-unverified-bf82b3317d6e').vehicleFacts.moped.scope,/4.0kW/);
assert.equal(byId.get('gmaps-unverified-45275e501cd2').canonicalFacilityId,'36001');
assert.equal(byId.get('gmaps-unverified-45275e501cd2').coordinateIssue.status,'requires_map_check_before_applying');
assert.deepEqual(byId.get('gmaps-unverified-d3b3abe5afff').correctedDiscoveryHints,['bicycle']);
// Only the explicitly reviewed facilities may leave discovery-only status.
for(const id of originalIds)assert.equal(places.get(id).discoveryOnly,byId.get(id)?.status!=='confirmed_facility');
assert.equal(review.appliedSummary.remainingUnconfirmedListings,481);
for(const d of review.decisions.filter(d=>d.status==='confirmed_duplicate'))assert.equal(places.get(d.id).displayEligible,false);
console.log('535-point queue, primary-source decisions, canonical identities, vehicle restrictions and staging boundaries validated.');
