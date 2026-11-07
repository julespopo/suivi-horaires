const CACHE='suivi-horaires-calendar-colors-20261107';
const ASSETS=['./','./index.html','./employee.html','./pilotage.html','./styles/base.css?v=rc1','./styles/v2.css?v=rc1','./styles/current.css?v=calendar-colors-20261107','./config.js?v=2.0-alpha2.9','./app.js?v=hardening-20261101','./employee.js?v=hardening-20261101','./pilotage.js?v=calendar-colors-20261107','./employee-week.js?v=calendar-colors-20261107','./manifest-employee.json?v=2.0-alpha2.9','./manifest-pilotage.json?v=2.0-alpha2.9','./icons/icon.svg'];
const OWNED_CACHE_PREFIX='suivi-horaires-';
const ASSET_URLS=new Set(ASSETS.map(asset=>new URL(asset,self.location.href).href));
const PAGE_PATHS=new Set(['./','./index.html','./employee.html','./pilotage.html'].map(page=>new URL(page,self.location.href).pathname));
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(OWNED_CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin)return;
  // Cache only this app's known files, with no private links or arbitrary API responses.
  let key=url.href;
  if(e.request.mode==='navigate'&&PAGE_PATHS.has(url.pathname)){
    url.search='';url.hash='';key=url.href;
  }else if(!ASSET_URLS.has(key))return;
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(e.request);
      if(response.ok){
        e.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
        return response;
      }
      // A temporary server error must never overwrite the working offline copy.
      return (await cache.match(key))||response;
    }catch{
      return (await cache.match(key))||Response.error();
    }
  })());
});
self.addEventListener('push',event=>{
  let data={};try{data=event.data?event.data.json():{}}catch{data={body:event.data?.text()||''}}
  const title=data.title||'Mes horaires';
  const options={body:data.body||'Pense à compléter tes horaires.',tag:data.tag||'suivi-horaires-reminder',renotify:true,data:{url:data.url||'./'},icon:'./icons/icon.svg',badge:'./icons/icon.svg'};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();const url=new URL(event.notification.data?.url||'./',self.location.href);if(url.origin!==self.location.origin)return;const target=url.href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const client of list){if(client.url===target&&'focus'in client)return client.focus()}return clients.openWindow?clients.openWindow(target):undefined}));
});

