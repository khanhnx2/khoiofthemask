// Service worker template. prepare-www.js fills in the version and asset list and writes www/sw.js.
// Every build gets a new version, so the browser sees a changed sw.js and installs it in the
// background. The new worker waits until the player taps "Cập nhật" in the page.
const VERSION = '__VERSION__';
const CACHE = `khoi-${VERSION}`;
const ASSETS = __ASSETS__;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k.startsWith('khoi-') && k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
    if (event.data && event.data.type === 'GET_VERSION') event.source.postMessage({ type: 'VERSION', version: VERSION });
});

// Cache first: the game works offline, and stays on one consistent version until updated.
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
    event.respondWith(
        caches.open(CACHE).then(async (cache) => {
            const hit = await cache.match(req.mode === 'navigate' ? './' : req, { ignoreSearch: true });
            return hit || fetch(req);
        }),
    );
});
