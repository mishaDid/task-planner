// Простой service worker: кеширует приложение для работы офлайн.
// При обновлении файлов увеличьте CACHE_NAME (например, v2, v3…),
// чтобы у пользователей подтянулась новая версия.
const CACHE_NAME = "planner-cache-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/i18n.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache)=>cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event)=>{
  event.waitUntil(
    caches.keys().then((names)=>
      Promise.all(names.filter(n=>n!==CACHE_NAME).map(n=>caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event)=>{
  if(event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached)=>{
      if(cached) return cached;
      return fetch(event.request)
        .then((response)=>{
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache)=>cache.put(event.request, copy)).catch(()=>{});
          return response;
        })
        .catch(()=>cached);
    })
  );
});
