const CACHE_VERSION = 'lexqcm-pwa-v1.3.6';
const CORE_CACHE = `${CACHE_VERSION}-core`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const DESIGN_HREF = './styles-v2.css?v=1.3.6';
const MOBILE_HREF = './mobile-fix.css?v=1.3.6';
const READER_CSS = './reader.css?v=1.3.6';
const READER_JS = './reader.js?v=1.3.6';
const MAJEURES_JS = './majeures-public.js?v=1.3.6';
const DESIGN_MARKER = 'data-lexqcm-design="v136"';
const READER_MARKER = 'data-lexqcm-reader="v136"';
const MAJEURES_MARKER = 'data-lexqcm-majeures="v136"';

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './offline.html',
  './styles-v2.css?v=1.3.6',
  './mobile-fix.css?v=1.3.6',
  './reader.css?v=1.3.6',
  './reader.js?v=1.3.6',
  './majeures-public.js?v=1.3.6',
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

async function enhanceHtml(response) {
  if (!response) return response;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;

  try {
    let html = await response.text();
    let injection = '';
    if (!html.includes(DESIGN_MARKER)) {
      injection += `<link ${DESIGN_MARKER} rel="stylesheet" href="${DESIGN_HREF}"><link rel="stylesheet" href="${MOBILE_HREF}">`;
    }
    if (!html.includes(READER_MARKER)) {
      injection += `<link ${READER_MARKER} rel="stylesheet" href="${READER_CSS}"><script ${READER_MARKER} src="${READER_JS}" defer></script>`;
    }
    if (!html.includes(MAJEURES_MARKER)) {
      injection += `<script ${MAJEURES_MARKER} src="${MAJEURES_JS}" defer></script>`;
    }
    if (injection) {
      html = html.includes('</head>') ? html.replace('</head>', `${injection}</head>`) : `${injection}${html}`;
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
      const type = response.headers.get('content-type') || '';
      const cache = await caches.open(RUNTIME_CACHE);

      // Only HTML navigations may replace the canonical application shell.
      // This prevents an embedded PDF from ever overwriting index.html in the PWA cache.
      if (type.includes('text/html')) {
        const enhanced = await enhanceHtml(response.clone());
        await cache.put(request, enhanced.clone());
        await cache.put('./index.html', enhanced.clone());
        return enhanced;
      }

      await cache.put(request, response.clone());
      return response;
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;

    const url = new URL(request.url);
    if (url.pathname.toLowerCase().endsWith('.pdf')) {
      return new Response('PDF indisponible hors connexion. Ouvre-le une première fois avec Internet.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    const shell = (await caches.match('./index.html')) ||
                  (await caches.match('./')) ||
                  (await caches.match('./offline.html'));
    return enhanceHtml(shell);
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

  if (request.destination === 'style' || url.pathname.endsWith('/styles-v2.css') || url.pathname.endsWith('/mobile-fix.css') || url.pathname.endsWith('/reader.css')) {
    event.respondWith(networkFirstAsset(request));
    return;
  }

  if (request.destination === 'script' || url.pathname.endsWith('/reader.js') || url.pathname.endsWith('/majeures-public.js')) {
    event.respondWith(networkFirstAsset(request));
    return;
  }

  if (url.pathname.toLowerCase().endsWith('.pdf')) {
    event.respondWith(networkFirstAsset(request));
    return;
  }

  if (['image', 'font', 'manifest'].includes(request.destination)) {
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
