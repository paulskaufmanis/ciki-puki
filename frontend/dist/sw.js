// App-shell cache. API calls are never cached.
const CACHE = "ciki-puki-v15";
const SHELL = ["/", "/manifest.json", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  // Navigations (/, /task/:id, /parent): network first, fall back to cached shell
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/")));
    return;
  }
  // Hashed build assets never change: cache first. Other files (styles.css, manifest…) are network first so edits show up
  if (!url.pathname.startsWith("/assets/")) {
    e.respondWith(
      fetch(req, { cache: "no-cache" })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }
  // Static assets: cache first, fill cache on miss
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          // Never cache a missing asset that the SPA fallback answered with index.html
          if (res.ok && !(res.headers.get("content-type") || "").includes("text/html")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
