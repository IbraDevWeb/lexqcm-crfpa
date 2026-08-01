'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')
    const supabase = createClient()

    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
        if (authError) throw authError
        const next = params.get('next') || '/dashboard'
        router.replace(next.startsWith('/') ? next : '/dashboard')
        router.refresh()
      } else {
        const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        })
        if (authError) throw authError
        setMessage('Compte créé. Vérifie ton e-mail pour confirmer ton inscription.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="authWrap">
      <form className="authCard" onSubmit={submit}>
        <Link href="/" className="logo" style={{ color: '#111827' }}>Lex<span>QCM</span></Link>
        <h1>{mode === 'login' ? 'Connexion' : 'Créer un compte'}</h1>
        <p>{mode === 'login' ? 'Retrouve ta progression sur tous tes appareils.' : 'Ta progression sera synchronisée dans le cloud.'}</p>
        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
        <div className="field">
          <label htmlFor="email">Adresse e-mail</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Mot de passe</label>
          <input id="password" type="password" minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn btnPrimary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
          {loading ? 'Chargement…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
        </button>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="muted">{mode === 'login' ? 'Pas encore de compte ?' : 'Déjà inscrit ?'}</span>
          <Link href={mode === 'login' ? '/auth/sign-up' : '/auth/login'} style={{ color: '#5146e5', fontWeight: 800 }}>
            {mode === 'login' ? 'Créer un compte' : 'Se connecter'}
          </Link>
        </div>
        {mode === 'login' && (
          <Link href="/auth/forgot-password" style={{ display: 'block', marginTop: 12, color: '#5146e5', fontWeight: 750, fontSize: 13 }}>
            Mot de passe oublié ?
          </Link>
        )}
      </form>
    </div>
  )
}
