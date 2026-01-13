const CACHE = "mtg-colecciones-v0.73";
const ASSETS = [
  "/mtg-colecciones/",
  "/mtg-colecciones/index.html",
  "/mtg-colecciones/styles.css",
  "/mtg-colecciones/app.js",
  "/mtg-colecciones/manifest.webmanifest",
  "/mtg-colecciones/icons/icon-192.png",
  "/mtg-colecciones/icons/icon-512.png",
  "/mtg-colecciones/icons/maskable-192.png",
  "/mtg-colecciones/icons/maskable-512.png",
  "/mtg-colecciones/icons/Botonmenu.png",
  "/mtg-colecciones/icons/manacodex.png",
  "/mtg-colecciones/icons/flecharegresar.png"
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
    const results = await Promise.allSettled(
      ASSETS.map(async (url) => {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn("SW precache failed:", url, err && (err.message || err));
        }
      })
    );
    // Asegura activación inmediata del SW nuevo
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
