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

export function PwaRegister() {
  useEffect(() => {
    removeLegacyStyles()

    const observer = new MutationObserver(removeLegacyStyles)
    observer.observe(document.head, { childList: true, subtree: true })

    const migrate = async () => {
      try {
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(
            keys
              .filter((key) => key.startsWith('lexqcm-pwa-') || key === 'lexqcm-next-v2-1')
              .map((key) => caches.delete(key)),
          )
        }

        if (!('serviceWorker' in navigator)) return
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        await registration.update()

        if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' })

        const reloadKey = 'lexqcm-next-sw-v2-2'
        const onControllerChange = () => {
          if (sessionStorage.getItem(reloadKey)) return
          sessionStorage.setItem(reloadKey, '1')
          window.location.reload()
        }

        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true })
      } catch (error) {
        console.warn('Service worker migration failed', error)
      }
    }

    void migrate()

    return () => observer.disconnect()
  }, [])

  return null
}
