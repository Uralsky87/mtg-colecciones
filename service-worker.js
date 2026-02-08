const CACHE = "mtg-colecciones-v0.8";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles.css?v=0.8",
  "./app.js",
  "./app.js?v=0.8",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/Botonmenu.png",
  "./icons/manacodex.png",
  "./icons/flecharegresar.png"
];

// Runtime caching strategies
const CACHE_RUNTIME = "mtg-runtime-v0.8";
const CACHE_IMAGES = "mtg-images-v0.8";
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function fallbackResponseFor(req) {
  const accept = (req && req.headers && req.headers.get("accept")) || "";
  if (accept.includes("text/html")) {
    return caches.match("./index.html").then(res => res || new Response("", { status: 504, statusText: "Offline" }));
  }
  return caches.match("./").then(res => res || new Response("", { status: 504, statusText: "Offline" }));
}

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
    // Delete old caches, keep only current version
    await Promise.all(keys
      .filter(k => !k.includes("v0.8"))
      .map(k => {
        console.log(`SW: deleting old cache ${k}`);
        return caches.delete(k);
      })
    );
    // Take control of clients without waiting for reload
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Strategy for app.js and styles.css: stale-while-revalidate
  if (req.url.includes("app.js") || req.url.includes("styles.css")) {
    e.respondWith(
      caches.match(req).then((cached) => {
        // Serve from cache immediately, revalidate in background
        const fetchPromise = fetch(req).then((res) => {
          if (res && res.ok && new URL(req.url).origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE_RUNTIME).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => null);
        
        return cached || fetchPromise.then(res => res || fallbackResponseFor(req));
      })
    );
    return;
  }

  // Strategy for Scryfall images: cache then network
  if (req.url.includes("scryfall.com") && req.url.includes(".jpg")) {
    e.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          // Check expiration
          const timestamp = cached.headers.get("x-cached-at");
          if (timestamp && (Date.now() - parseInt(timestamp)) < CACHE_EXPIRY_MS) {
            return cached;
          }
        }
        
        // Cache miss or expired, fetch
        return fetch(req).then((res) => {
          if (res && res.ok && res.status === 200) {
            if (res.type === "opaque") {
              caches.open(CACHE_IMAGES).then(c => c.put(req, res.clone()));
              return res;
            }

            const copy = res.clone();
            const headers = new Headers(copy.headers);
            headers.set("x-cached-at", Date.now().toString());
            const respWithMeta = new Response(copy.body, {
              status: copy.status,
              statusText: copy.statusText,
              headers: headers
            });
            caches.open(CACHE_IMAGES).then(c => c.put(req, respWithMeta));
          }
          return res;
        }).catch(() => cached || fallbackResponseFor(req));
      })
    );
    return;
  }

  // Default: network first, then cache
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok && new URL(req.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE_RUNTIME).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => null).then(res => res || caches.match(req).then(cached => cached || fallbackResponseFor(req)))
  );
});
