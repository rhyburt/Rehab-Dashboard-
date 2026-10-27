// Rehab Dashboard — service worker (offline app shell).
// Bump CACHE on every release so installed copies pick up the new files.
const CACHE = "rehabdash-v5";
const PREFIX = "rehabdash-";
const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/calc.js",
  "./js/csv.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/favicon-64.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// Only remove this app's old caches — other apps on the same github.io origin keep theirs.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Same-origin GET only (the app makes no other requests): answer from the cache straight away,
// and refresh the cached copy from the network in the background so the next launch is up to date.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const fresh = caches.open(CACHE).then((cache) =>
    fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
  );
  e.waitUntil(fresh.catch(() => {}));
  e.respondWith(
    caches.open(CACHE)
      .then((cache) => cache.match(req, { ignoreSearch: true }))
      .then((cached) => cached || fresh.catch(() =>
        req.mode === "navigate" ? caches.open(CACHE).then((c) => c.match("./index.html")) : Response.error()))
  );
});
