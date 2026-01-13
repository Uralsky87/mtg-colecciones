const CACHE = "mtg-colecciones-v0.75";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/Botonmenu.png",
  "./icons/manacodex.png",
  "./icons/flecharegresar.png"
];

// Escuchar mensaje de SKIP_WAITING
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const url of ASSETS) {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (res && res.ok) {
          await cache.put(url, res.clone());
        } else {
          console.warn("SW precache skip (not ok):", url, res && res.status);
        }
      } catch (err) {
        console.warn("SW precache failed:", url, err && (err.message || err));
      }
    }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    // Toma control de clientes abiertos sin esperar recarga
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      // Cachea solo si respuesta OK y es del mismo origen
      if (res && res.ok && new URL(req.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match("/mtg-colecciones/")))
  );
});
