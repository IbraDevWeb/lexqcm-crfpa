const CACHE_VERSION = 'lexqcm-pwa-v1.3.4';
const CORE_CACHE = `${CACHE_VERSION}-core`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const DESIGN_HREF = './styles-v2.css?v=1.3.4';
const MOBILE_HREF = './mobile-fix.css?v=1.3.4';
const DESIGN_MARKER = 'data-lexqcm-design="v134"';

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './offline.html',
  './styles-v2.css?v=1.3.4',
  './mobile-fix.css?v=1.3.4',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CORE_CACHE).then(cache => cache.addAll(CORE)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('lexqcm-pwa-') && k !== CORE_CACHE && k !== RUNTIME_CACHE)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function applyDesign(response) {
  if (!response) return response;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;

  try {
    let html = await response.text();
    if (!html.includes(DESIGN_MARKER)) {
      const designLinks = `<link ${DESIGN_MARKER} rel="stylesheet" href="${DESIGN_HREF}"><link rel="stylesheet" href="${MOBILE_HREF}">`;
      html = html.includes('</head>')
        ? html.replace('</head>', `${designLinks}</head>`)
        : `${designLinks}${html}`;
    }

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch {
    return response;
  }
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      const designed = await applyDesign(response.clone());
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, designed.clone());
      await cache.put('./index.html', designed.clone());
      return designed;
    }
    return applyDesign(response);
  } catch {
    const cached = (await caches.match(request, { ignoreSearch: true })) ||
                   (await caches.match('./index.html')) ||
                   (await caches.match('./')) ||
                   (await caches.match('./offline.html'));
    return applyDesign(cached);
  }
}

async function networkFirstAsset(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await caches.match(request, {ignoreSearch:true})) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await caches.match(request);
  const network = fetch(request).then(response => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (request.destination === 'style' || url.pathname.endsWith('/styles-v2.css') || url.pathname.endsWith('/mobile-fix.css')) {
    event.respondWith(networkFirstAsset(request));
    return;
  }

  if (['script', 'image', 'font', 'manifest'].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(async response => {
      if (response && response.ok) {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, response.clone());
      }
      return response;
    }))
  );
});
