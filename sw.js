// Cachea la app y el detector de rostro para que funcione sin internet.
// Los archivos propios van "primero red": así una version nueva siempre llega.
// Los del CDN (wasm y modelo, que no cambian) van "primero cache".
const CACHE = "mirada-v9";
const LOCAL = ["./", "./index.html", "./app.js", "./mivoz.js", "./manifest.webmanifest",
               "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(LOCAL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if(e.request.method !== "GET") return;
  const u = e.request.url;
  const externo = u.includes("jsdelivr.net") || u.includes("storage.googleapis.com");

  if(externo){                                   // primero cache
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if(res.ok){ const c = res.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); }
      return res;
    })));
    return;
  }
  e.respondWith(                                 // primero red, cache de respaldo
    fetch(e.request).then(res => {
      if(res.ok){ const c = res.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
