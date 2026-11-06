// Somente arquivos públicos da aplicação; dados de conta e APIs nunca entram no cache.
const CACHE='pupi-shell-v2';
const shell=['/','/manifest.webmanifest','/icons/pupi-192.png','/icons/pupi-512.png','/fonts/dm-sans-latin-wght-normal.woff2','/fonts/nunito-sans-latin-wght-normal.woff2'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);await cache.addAll(shell);
  const page=await cache.match('/');const html=await page.text();
  const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[A-Za-z0-9._-]+\.(?:js|css))"/g)].map(match=>match[1]);
  await cache.addAll([...new Set(assets)]);
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('pupi-shell-')&&name!==CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.search)return;
  const navigation=request.mode==='navigate'&&url.pathname==='/';
  const asset=/^\/assets\/[A-Za-z0-9._-]+\.(?:js|css)$/.test(url.pathname);
  const font=url.pathname.startsWith('/fonts/')&&shell.includes(url.pathname);
  if(!navigation&&!asset&&!font)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try {
      const response=await fetch(request);
      if(response.ok&&response.type==='basic'&&!/no-store/i.test(response.headers.get('cache-control')||''))await cache.put(navigation?'/':request,response.clone());
      return response;
    } catch {
      return await cache.match(navigation?'/':request)||Response.error();
    }
  })());
});
