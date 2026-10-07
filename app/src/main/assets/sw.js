const CACHE='grapevine-v17';
const IMAGE_CACHE='grapevine-images-v1';
const ASSETS=['./index.html','./styles.css','./app.js','./manifest.webmanifest','./assets/grapevine-logo.jpg','./sw.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  const isImage=e.request.destination==='image' || /\/storage\/v1\/object\/public\/member-photos\//.test(u.pathname);
  if(isImage){
    e.respondWith(caches.open(IMAGE_CACHE).then(async cache=>{
      const hit=await cache.match(e.request);
      if(hit){
        fetch(e.request).then(r=>{if(r.ok)cache.put(e.request,r.clone())}).catch(()=>{});
        return hit;
      }
      try{const r=await fetch(e.request); if(r.ok) await cache.put(e.request,r.clone()); return r;}
      catch(err){return new Response('',{status:504});}
    }));
    return;
  }
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{
    if(r.ok){const copy=r.clone();caches.open(CACHE).then(x=>x.put(e.request,copy));}
    return r;
  }).catch(()=>caches.match('./index.html'))));
});
