const CACHE = "mtg-colecciones-v0.61";
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
  "/mtg-colecciones/icons/Fondosmenus.png"
];

// Escuchar mensaje de SKIP_WAITING
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      // Cachea solo tu app (no Scryfall)
      if (new URL(req.url).origin === location.origin) {
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match("/mtg-colecciones/")))
  );
});
