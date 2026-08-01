'use client'

import { useEffect } from 'react'

const LEGACY_STYLE_PARTS = ['styles-v2.css', 'mobile-fix.css', 'reader.css']

function removeLegacyStyles() {
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
    const href = link.getAttribute('href') || ''
    const legacyMarker = link.hasAttribute('data-lexqcm-design') || link.hasAttribute('data-lexqcm-reader')
    if (legacyMarker || LEGACY_STYLE_PARTS.some((part) => href.includes(part))) link.remove()
  })
}

function isTechnicalVercelHost(hostname: string) {
  return hostname.endsWith('.vercel.app') && hostname !== 'lexqcm-crfpa.vercel.app'
}

async function clearOldLexCaches() {
  if (!('caches' in window)) return
  const keys = await caches.keys()
  await Promise.all(keys.filter((key) => key.startsWith('lexqcm-')).map((key) => caches.delete(key)))
}

export function PwaRegister() {
  useEffect(() => {
    removeLegacyStyles()
    const hostname = window.location.hostname

    const setup = async () => {
      try {
        if (isTechnicalVercelHost(hostname)) {
          await clearOldLexCaches()
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations()
            await Promise.all(registrations.map((registration) => registration.unregister()))
          }
          return
        }

        let manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"][data-lexqcm-manifest]')
        if (!manifest) {
          manifest = document.createElement('link')
          manifest.rel = 'manifest'
          manifest.href = '/manifest.webmanifest'
          manifest.setAttribute('data-lexqcm-manifest', 'true')
          document.head.appendChild(manifest)
        }

        if (!('serviceWorker' in navigator)) return
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        await registration.update()
        if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      } catch (error) {
        console.warn('Service worker registration failed', error)
      }
    }

    void setup()
  }, [])

  return null
}
