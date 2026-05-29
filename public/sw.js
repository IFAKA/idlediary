const CACHE_VERSION =
  new URL(self.location.href).searchParams.get("v")?.replace(/[^a-zA-Z0-9._-]/g, "-") ?? "v5";
const CACHE_NAME = `idlediary-${CACHE_VERSION}`;
const OFFLINE_ASSETS_URL = "/offline-assets.json";
const APP_ROUTES = ["/", "/videos", "/draft", "/result", "/demo/launch"];
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon.svg", "/favicon.ico"];
const REQUIRED_ASSETS = [
  ...APP_ROUTES,
  ...APP_SHELL,
  "/ffmpeg/ffmpeg-core.js",
  "/ffmpeg/ffmpeg-core.wasm",
  "/demo-clips/manifest.json",
  "/demo-clips/coffee-preview.mp4",
  "/demo-clips/coffee.mp4",
  "/demo-clips/laptop.mp4",
  "/demo-clips/street.mp4",
  "/demo-clips/sunset.mp4",
  "/demo-clips/gym.mp4",
  "/demo-clips/result.mp4",
];
const STATIC_ASSET_PATTERN =
  /\.(?:css|js|mjs|png|jpg|jpeg|webp|svg|ico|json|woff2?|wasm|mp4)$/;

function unique(values) {
  return [...new Set(values)];
}

function sameOriginRequest(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin;
}

async function fetchOfflineAssets() {
  try {
    const response = await fetch(OFFLINE_ASSETS_URL, { cache: "no-store" });
    if (!response.ok) return [];
    const manifest = await response.json();
    return Array.isArray(manifest.assets) ? manifest.assets : [];
  } catch {
    return [];
  }
}

async function cacheRequiredAssets() {
  const generatedAssets = await fetchOfflineAssets();
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(unique([...REQUIRED_ASSETS, ...generatedAssets]));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheRequiredAssets());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !sameOriginRequest(event.request)) return;

  const url = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(
          async () =>
            (await caches.match(event.request)) ??
            (await caches.match("/")) ??
            Response.error(),
        ),
    );
    return;
  }

  const isStaticAsset =
    REQUIRED_ASSETS.includes(url.pathname) ||
    url.pathname.startsWith("/ffmpeg/") ||
    url.pathname.startsWith("/demo-clips/") ||
    url.pathname.startsWith("/_next/static/") ||
    STATIC_ASSET_PATTERN.test(url.pathname);

  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request));
    }),
  );
});
