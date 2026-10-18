const CACHE_NAME = "tb-pwa-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./index-1.html",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(
      ASSETS.map((asset) => cache.add(asset).catch(() => undefined))
    ))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.url.includes("firestore.googleapis.com") || e.request.url.includes("gstatic.com")) {
    return;
  }
  
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const eventKey = notification.data && notification.data.eventKey;
  notification.close();
  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windowClients) {
      client.postMessage({ type: "completed-notification-click", eventKey });
      if (client.focus) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(self.registration.scope);
  })());
});

self.addEventListener("notificationclose", (event) => {
  const eventKey = event.notification.data && event.notification.data.eventKey;
  if (!eventKey) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
    windowClients.forEach(client => client.postMessage({ type: "completed-notification-close", eventKey }));
  }));
});
