import type { Metadata, Viewport } from 'next'
import './globals.css'
import './product-polish.css'
import { PwaRegister } from '@/components/pwa-register'

export const metadata: Metadata = {
  title: {
    default: 'LexQCM — CRFPA',
    template: '%s · LexQCM',
  },
  description: 'Banque QCM, dossiers progressifs et répétition espacée pour le CRFPA.',
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  )
}
