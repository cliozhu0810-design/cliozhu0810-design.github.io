/* Unverified discovery records expose one external destination, never admission claims. */
(function(root){
 function googleUrl(place){try{const u=new URL(place.googleMapsUrl||'');return u.protocol==='https:'&&['www.google.com','google.com','www.google.co.jp','google.co.jp'].includes(u.hostname)&&u.pathname.startsWith('/maps/')?u.href:null;}catch{return null;}}
 function profile(place,vehicle){return {admissionStatus:'unknown',temporaryStatus:'unverified',regularStatus:'unverified',classesRaw:[],tariffs:[],sources:[],discoveryOnly:true,discoveryCategoryRelevant:(place.discoveryVehicleHints||[]).some(h=>h===vehicle||vehicle==='motorcycle'&&h==='moped'),checked:place.discoveredOn||''};}
 root.TomespotDiscoveryListings={googleUrl,profile};
})(globalThis);
