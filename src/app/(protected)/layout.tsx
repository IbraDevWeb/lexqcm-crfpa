import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return (
      <div className="authWrap">
        <div className="authCard">
          <div className="logo" style={{ color: '#111827' }}>Lex<span>QCM</span></div>
          <h1>Supabase à connecter</h1>
          <p>Ajoute les deux variables Supabase dans Vercel ou dans ton fichier <code>.env.local</code>.</p>
          <div className="row"><span>NEXT_PUBLIC_SUPABASE_URL</span><b>requis</b></div>
          <div className="row"><span>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</span><b>requis</b></div>
        </div>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return <AppShell email={user.email ?? 'Compte LexQCM'}>{children}</AppShell>
}
