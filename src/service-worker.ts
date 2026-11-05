/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;
const CACHE = "atmos-shell-v1";
const SHELL = [
  "/offline.html",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("atmos-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Never cache Supabase requests, auth sessions, HTML dashboards, or sensor data.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match("/offline.html"))!),
    );
    return;
  }
  if (SHELL.includes(url.pathname))
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    );
});
export {};
