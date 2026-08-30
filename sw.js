/* ==========================================================
   Control Ganadero — service worker
   Guarda la app y el SDK de Firebase en el teléfono para que
   todo abra sin señal. Súbelo junto al index.html.
   ========================================================== */

const CACHE = "ganadero-v3";
const BASE = new URL("./", self.location).pathname;

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll([BASE, BASE + "index.html"]).catch(() => c.add(BASE)))
      .catch(() => {})
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/** El SDK de Firebase lleva la versión en la URL, así que nunca cambia:
    se puede guardar para siempre. Sin esto la app no abre sin señal. */
const esSDK = (u) =>
  u.hostname === "www.gstatic.com" && u.pathname.includes("/firebasejs/");

/** Las tipografías tampoco cambian. */
const esTipografia = (u) =>
  u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";

/** Datos en vivo: nunca se cachean, Firestore ya trae su propio offline. */
const esDatos = (u) =>
  /firestore\.googleapis|identitytoolkit|securetoken|firebaseio|firebaseinstallations/
    .test(u.hostname);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (esDatos(url)) return;   // que pase directo

  // La app: primero la red saltándose la caché del navegador, para que las
  // actualizaciones lleguen solas. Si no hay señal, la copia guardada.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(new Request(req.url, { cache: "reload", credentials: "same-origin" }))
        .then((r) => {
          if (r && r.ok) {
            const copia = r.clone();
            caches.open(CACHE).then((c) => c.put(BASE, copia)).catch(() => {});
          }
          return r;
        })
        .catch(() =>
          caches.match(BASE)
            .then((r) => r || caches.match(BASE + "index.html"))
            .then((r) => r || new Response(
              "<!doctype html><meta charset=utf-8><title>Sin conexion</title>" +
              "<body style='font-family:system-ui;padding:40px;text-align:center'>" +
              "<h1>Sin conexion</h1><p>Abre la app una vez con internet para poder " +
              "usarla despues sin senal.</p></body>",
              { headers: { "Content-Type": "text/html; charset=utf-8" } }))
        )
    );
    return;
  }

  // SDK y tipografías: primero lo guardado. Es lo que permite abrir sin señal.
  if (esSDK(url) || esTipografia(url)) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) {
          fetch(req).then((r) => {
            if (r && r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone()));
          }).catch(() => {});
          return hit;
        }
        return fetch(req).then((r) => {
          if (r && (r.ok || r.type === "opaque")) {
            const copia = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
          }
          return r;
        });
      })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((r) => {
          if (r && r.ok) {
            const copia = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
          }
          return r;
        }).catch(() => hit)
      )
    );
  }
});

/** Permite que la app pida guardar el SDK apenas termina de cargar. */
self.addEventListener("message", (e) => {
  if (e.data && e.data.tipo === "guardar-sdk" && Array.isArray(e.data.urls)) {
    e.waitUntil(
      caches.open(CACHE).then((c) =>
        Promise.all(e.data.urls.map((u) => c.add(u).catch(() => {})))
      )
    );
  }
});
