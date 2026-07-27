import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PwaRegister } from '@/components/pwa-register'

export const metadata: Metadata = {
  title: {
    default: 'LexQCM — CRFPA',
    template: '%s · LexQCM',
  },
  description: 'Banque QCM, dossiers progressifs et répétition espacée pour le CRFPA.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#111827',
}

const legacyStyleGuard = `
(() => {
  const parts = ['styles-v2.css','mobile-fix.css','reader.css'];
  const clean = () => {
    document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (link.hasAttribute('data-lexqcm-design') || link.hasAttribute('data-lexqcm-reader') || parts.some((part) => href.includes(part))) {
        link.remove();
      }
    });
  };
  clean();
  const observer = new MutationObserver(clean);
  observer.observe(document.head, { childList: true, subtree: true });
  window.addEventListener('load', () => setTimeout(() => observer.disconnect(), 3000), { once: true });
})();
`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: legacyStyleGuard }} />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  )
}
