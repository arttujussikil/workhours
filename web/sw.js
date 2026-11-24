// Offline support.
// Bump CACHE on every release so installed apps download the new version.
const CACHE = 'workhours-v7';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  // cache: 'reload' skips the HTTP cache so a new release never caches stale files.
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  // Deleting the old caches also throws away anything a broken deploy left in them.
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Only keep real app pages, never some other HTML GitHub might serve at this address. */
async function isAppPage(res) {
  if (!res.ok) return false;
  const text = await res.clone().text();
  return text.includes('id="view"') && text.includes('app.js');
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // The page itself: network first (so updates show at once), cached copy when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match('./index.html');
        try {
          // req.url, not req: a navigation request can't be copied with new options.
          const res = await fetch(req.url, { cache: 'no-cache' });
          if (await isAppPage(res)) {
            cache.put('./index.html', res.clone());
            return res;
          }
          return cached || res;
        } catch {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // Everything else: serve from cache, refresh the cache in the background.
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req, { cache: 'no-cache' })
        .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
