const CACHE='suivi-horaires-v2-0-alpha1-5';
const ASSETS=['./','./index.html','./employee.html','./pilotage.html','./styles.css?v=2.0-alpha1.5','./config.js?v=2.0-alpha1.5','./app.js?v=2.0-alpha1.5','./manifest.json','./manifest-pilotage.json','./manifest-patrick.json','./manifest-jerome.json','./manifest-paul.json','./manifest-louis.json','./icons/icon.svg'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))]))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});return r}).catch(async()=>{const direct=await caches.match(e.request);if(direct)return direct;if(e.request.mode==='navigate'){const url=new URL(e.request.url);if(url.pathname.endsWith('/employee.html'))return caches.match('./employee.html');if(url.pathname.endsWith('/pilotage.html'))return caches.match('./pilotage.html');return caches.match('./index.html')}return undefined}))});
self.addEventListener('push',event=>{
  let data={};try{data=event.data?event.data.json():{}}catch{data={body:event.data?.text()||''}}
  const title=data.title||'Mes horaires';
  const options={body:data.body||'Pense à compléter tes horaires.',tag:data.tag||'suivi-horaires-reminder',renotify:true,data:{url:data.url||'./'},icon:'./icons/icon.svg',badge:'./icons/icon.svg'};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();const target=new URL(event.notification.data?.url||'./',self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const client of list){if(client.url===target&&'focus'in client)return client.focus()}return clients.openWindow?clients.openWindow(target):undefined}));
});
