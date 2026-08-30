/* ==========================================================
   Control Ganadero — service worker
   Guarda la app en el teléfono para que abra sin señal.
   Súbelo junto al index.html, en la misma carpeta.
   ========================================================== */

const CACHE = "ganadero-v1";
const BASE = new URL("./", self.location).pathname;

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([BASE, BASE + "index.html"])
    .catch(() => c.add(BASE))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Firebase y sus datos nunca se cachean: tienen su propio manejo offline.
  if (/googleapis|gstatic|firebaseio|firebaseapp/.test(url.hostname)) return;

  // La app: primero la red, para que las actualizaciones lleguen solas;
  // si no hay señal, la copia guardada.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(BASE, copia));
          return r;
        })
        .catch(() => caches.match(BASE).then((r) => r || caches.match(BASE + "index.html")))
    );
    return;
  }

  // Tipografías y demás: primero lo guardado, más rápido.
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((r) => {
        if (r.ok && (url.origin === self.location.origin || /fonts\./.test(url.hostname))) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return r;
      }).catch(() => hit)
    )
  );
});
