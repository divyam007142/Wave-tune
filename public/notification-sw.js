const SHELL_CACHE = "wave-tune-shell-v1";
const APP_STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/wave-tune-icon-192.png",
  "/wave-tune-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const shell = await fetch("/");
    if (!shell.ok) throw new Error("Wave Tune's app shell could not be cached.");
    const html = await shell.clone().text();
    await cache.put("/", shell);

    const bundledAssets = Array.from(
      html.matchAll(/(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/g),
      (match) => match[1],
    );
    await cache.addAll([...APP_STATIC_ASSETS, ...bundledAssets]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith("wave-tune-") && name !== SHELL_CACHE)
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put("/", response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match("/"));
      }
    })());
    return;
  }

  if (url.pathname === "/api/catalog/trending") {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      const update = fetch(request).then((response) => {
        if (response.ok) void cache.put(request, response.clone());
        return response;
      });
      if (cached) {
        void update.catch(() => undefined);
        return cached;
      }
      return update;
    })());
    return;
  }

  const isAppAsset =
    url.pathname.startsWith("/assets/") ||
    APP_STATIC_ASSETS.includes(url.pathname);
  if (!isAppAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) void cache.put(request, response.clone());
    return response;
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const appWindow = windows.find((client) => "focus" in client);
    if (appWindow) {
      await appWindow.focus();
      return;
    }
    await self.clients.openWindow(self.registration.scope);
  })());
});
