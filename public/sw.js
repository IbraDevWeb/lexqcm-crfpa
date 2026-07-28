const CACHE = 'lexqcm-next-v2-clean-qcm-7'
const CORE = ['/offline', '/manifest.webmanifest', '/icon.svg', '/generated/questions.json', '/generated/cases.json', '/generated/meta.json', '/generated/quality-report.json', '/generated/legal-authority-report.json']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE).catch(() => undefined)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => key.startsWith('lexqcm-') && key !== CACHE)
        .map((key) => caches.delete(key)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (url.pathname.startsWith('/generated/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      try {
        const fresh = await fetch(request, { cache: 'no-store' })
        if (fresh.ok) await cache.put(request, fresh.clone())
        return fresh
      } catch {
        return (await caches.match(request, { ignoreSearch: true })) || Response.error()
      }
    })())
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request, { cache: 'no-store' })
      } catch {
        return (await caches.match('/offline')) || Response.error()
      }
    })())
    return
  }

  if (['script', 'style'].includes(request.destination)) {
    event.respondWith((async () => {
      try {
        return await fetch(request, { cache: 'no-store' })
      } catch {
        return (await caches.match(request, { ignoreSearch: true })) || Response.error()
      }
    })())
    return
  }

  if (['image', 'font'].includes(request.destination)) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) {
        const cache = await caches.open(CACHE)
        await cache.put(request, response.clone())
      }
      return response
    })())
  }
})
