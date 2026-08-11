/* =========================================================
   sw.js — service worker: hace la app instalable y deja el
   "cascarón" (HTML/CSS/JS propios) disponible sin internet.

   Los datos siguen viviendo en localStorage + Supabase (ver
   storage.js) — este archivo solo cachea los ARCHIVOS de la
   app, no los datos del usuario.
   ========================================================= */

var CACHE_NAME = "finanza-shell-v3";

var SHELL_FILES = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/styles.css",
  "/js/install.js",
  "/js/monitoring.js",
  "/js/push.js",
  "/js/utils.js",
  "/js/icons.js",
  "/js/storage.js",
  "/js/auth.js",
  "/js/modals.js",
  "/js/config.js",
  "/js/app.js",
  "/js/views/setup.js",
  "/js/views/home.js",
  "/js/views/receivables.js",
  "/js/views/payables.js",
  "/js/views/report.js",
  "/js/views/savings.js",
  "/js/views/account.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon.svg",
  "/icons/favicon.ico"
];

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_FILES).catch(function () {
        // si algun archivo falla no tumba la instalacion completa
      });
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return; // deja pasar POST/PATCH/DELETE (Supabase) sin tocar

  var url = new URL(req.url);
  var isOwnFile = url.origin === self.location.origin;

  if (isOwnFile) {
    // archivos propios: red primero (siempre la version mas nueva si hay
    // internet), y si falla (sin conexion) se sirve lo cacheado.
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) { return cached || caches.match("/index.html"); });
      })
    );
    return;
  }

  // recursos externos (fuentes, supabase-js): cache primero, red de respaldo
  if (url.hostname.indexOf("supabase.co") === -1) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        return cached || fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
          return res;
        });
      })
    );
  }
  // llamadas a supabase.co: se dejan pasar directo a la red, sin cachear.
});

// ---------------------------------------------------------
// Recordatorios push: el servidor (api/send-reminders.js, via
// Vercel Cron) manda el aviso; aqui solo se muestra y se abre la
// app al tocarlo.
// ---------------------------------------------------------

self.addEventListener("push", function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}

  var title = data.title || "FinzApp";
  var options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ("focus" in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
