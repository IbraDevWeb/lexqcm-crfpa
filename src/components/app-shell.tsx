'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const links = [
  { href: '/dashboard', label: 'Tableau de bord', icon: '▦' },
  { href: '/train', label: 'Entraînement', icon: '▶' },
  { href: '/cases', label: 'Dossiers progressifs', icon: '◆' },
  { href: '/errors', label: 'Mes erreurs', icon: '↻' },
  { href: '/stats', label: 'Statistiques', icon: '⌁' },
  { href: '/bank', label: 'Banque QCM', icon: '☷' },
  { href: '/updates', label: 'Actualisations 2026', icon: '✓' },
  { href: '/pdf', label: 'Cours & PDF', icon: '▤' },
  { href: '/majeures', label: 'Majeures types', icon: '§' },
  { href: '/quality', label: 'Qualité & sources', icon: '◇' },
  { href: '/data', label: 'Données', icon: '⇅' },
]

export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/auth/login')
    router.refresh()
  }

  return <div className="shell">
    <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Navigation LexQCM">
      <Link href="/dashboard" className="logo" onClick={() => setOpen(false)}>Lex<span>QCM</span></Link>
      <div className="sideEdition"><small>SESSION</small><strong>CRFPA 2026</strong></div>
      <nav className="nav" aria-label="Navigation principale">
        {links.map((item, index) => <Link key={item.href} href={item.href} className={pathname.startsWith(item.href) ? 'active' : ''} onClick={() => setOpen(false)}><span className="navIndex">{String(index + 1).padStart(2, '0')}</span><span className="navIcon" aria-hidden>{item.icon}</span><span className="navLabel">{item.label}</span></Link>)}
      </nav>
      <div className="sidebarFoot">
        <div className="accountEmail">{email}</div>
        <Link className="btn btnSide" href="/account" onClick={() => setOpen(false)}>Mon compte</Link>
        <button className="btn btnSideSecondary" onClick={signOut}>Se déconnecter</button>
      </div>
    </aside>
    <button className={`backdrop ${open ? 'open' : ''}`} aria-label="Fermer le menu" onClick={() => setOpen(false)} />
    <main className="page" id="main-content">
      <div className="mobileBar">
        <button className="menuButton" aria-label="Ouvrir le menu" aria-expanded={open} onClick={() => setOpen(true)}>☰</button>
        <Link href="/dashboard" className="logo">Lex<span>QCM</span></Link>
        <Link href="/account" className="mobileAccount" aria-label="Mon compte">●</Link>
      </div>
      <div className="pageInner">{children}</div>
    </main>
  </div>
}
