/* ==========================================================
   Control Ganadero — service worker
   Guarda la app y el SDK de Firebase en el teléfono para que
   todo abra sin señal. Súbelo junto al index.html.
   ========================================================== */

const CACHE = "ganadero-v5";
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

  /* La app: primero la copia guardada, para que abra al instante aunque no
     haya señal en el corral. Detrás, sin hacer esperar a nadie, se baja la
     versión de internet y se reemplaza la copia. La app ya avisa sola cuando
     hay una versión más reciente, así que nada se queda atrás por esto. */
  if (req.mode === "navigate") {
    e.respondWith(
      caches.match(BASE)
        .then((r) => r || caches.match(BASE + "index.html"))
        .then((guardada) => {
          /* La copia se guarda ESPERANDO a que termine. Antes se lanzaba y se
             seguia adelante: el navegador apaga el service worker en cuanto
             cree que acabo, asi que muchas veces la copia nueva no llegaba a
             escribirse y la app volvia a abrir con la version vieja. */
          const red = fetch(new Request(req.url, { cache: "reload", credentials: "same-origin" }))
            .then(async (r) => {
              if (r && r.ok) {
                const copia = r.clone();
                try {
                  const c = await caches.open(CACHE);
                  await c.put(BASE, copia);
                  await c.put(BASE + "index.html", r.clone());
                } catch {}
              }
              return r;
            });

          e.waitUntil(red.catch(() => {}));
          if (guardada) return guardada;

          // Primera vez en este teléfono: no hay copia, toca esperar la red.
          return red.catch(() => new Response(
            "<!doctype html><meta charset=utf-8><title>Sin conexion</title>" +
            "<body style='font-family:system-ui;padding:40px;text-align:center'>" +
            "<h1>Sin conexion</h1><p>Abre la app una vez con internet para poder " +
            "usarla despues sin senal.</p></body>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }));
        })
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
    /* Las consultas con ?v=... son la revision de version: cada una es una
       direccion distinta, asi que guardarlas llenaba el telefono con una
       copia nueva del archivo cada dos minutos. Van directo a la red. */
    if (url.search) return;

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

/** La app puede pedir que se rehaga la copia guardada al actualizar. */
self.addEventListener("message", (e) => {
  if (e.data && e.data.tipo === "refrescar-app") {
    e.waitUntil((async () => {
      try {
        const r = await fetch(new Request(BASE, { cache: "reload", credentials: "same-origin" }));
        if (r && r.ok) {
          const c = await caches.open(CACHE);
          await c.put(BASE, r.clone());
          await c.put(BASE + "index.html", r.clone());
        }
      } catch {}
      e.source && e.source.postMessage({ tipo: "app-refrescada" });
    })());
    return;
  }
  if (e.data && e.data.tipo === "guardar-sdk" && Array.isArray(e.data.urls)) {
    e.waitUntil(
      caches.open(CACHE).then((c) =>
        Promise.all(e.data.urls.map((u) => c.add(u).catch(() => {})))
      )
    );
  }
});
