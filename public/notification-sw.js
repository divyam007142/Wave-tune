const SHELL_CACHE = "wave-tune-shell-v4";
const APP_STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/wave-tune-logo.png",
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

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { title: "Wave Tune", body: "You have a new listening update." };
  }

  event.waitUntil((async () => {
    const title = typeof payload.title === "string" ? payload.title : "Wave Tune";
    const body = typeof payload.body === "string" ? payload.body : "A new listening update is ready.";
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const visibleWindows = windows.filter((client) => client.visibilityState === "visible");
    if (visibleWindows.length) {
      for (const client of visibleWindows) {
        client.postMessage({ type: "wave-tune:push", payload });
      }
      return;
    }

    const artwork = typeof payload.artwork === "string" ? payload.artwork : "/wave-tune-icon-192.png";
    await self.registration.showNotification(title, {
      body,
      icon: artwork,
      image: artwork,
      badge: "/wave-tune-icon-192.png",
      tag: typeof payload.tag === "string" ? payload.tag : "wave-tune-update",
      renotify: false,
      data: { url: new URL("/?view=notifications", self.location.origin).href },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL("/?view=notifications", self.location.origin);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const appWindow = windows.find((client) => "focus" in client);
    if (appWindow) {
      await appWindow.focus();
      appWindow.postMessage({ type: "wave-tune:open-notifications" });
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});
