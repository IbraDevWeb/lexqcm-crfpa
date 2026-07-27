'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const links = [
  { href: '/dashboard', label: 'Tableau de bord', icon: '▦' },
  { href: '/train', label: 'Entraînement', icon: '▶' },
  { href: '/account', label: 'Mon compte', icon: '●' },
]

export function AppShell({
  email,
  children,
}: {
  email: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/auth/login')
    router.refresh()
  }

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Link href="/dashboard" className="logo" onClick={() => setOpen(false)}>
          Lex<span>QCM</span>
        </Link>
        <nav className="nav" aria-label="Navigation principale">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname.startsWith(item.href) ? 'active' : ''}
              onClick={() => setOpen(false)}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebarFoot">
          <div>{email}</div>
          <button className="btn btnGhost" style={{ marginTop: 10, width: '100%' }} onClick={signOut}>
            Se déconnecter
          </button>
        </div>
      </aside>
      <button
        className={`backdrop ${open ? 'open' : ''}`}
        aria-label="Fermer le menu"
        onClick={() => setOpen(false)}
      />
      <main className="page">
        <div className="mobileBar">
          <button className="menuButton" aria-label="Ouvrir le menu" onClick={() => setOpen(true)}>
            ☰
          </button>
          <Link href="/dashboard" className="logo">
            Lex<span>QCM</span>
          </Link>
          <span style={{ width: 44 }} />
        </div>
        {children}
      </main>
    </div>
  )
}
