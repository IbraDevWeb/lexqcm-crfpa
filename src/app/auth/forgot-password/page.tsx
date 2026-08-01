'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const supabase = createClient()
      const redirectTo = `${window.location.origin}/auth/callback?next=/auth/update-password`
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (resetError) throw resetError
      setMessage('Lien envoyé. Consulte ta boîte mail pour choisir un nouveau mot de passe.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’envoyer le lien.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="authWrap"><form className="authCard" onSubmit={submit}>
    <Link href="/auth/login" className="logo" style={{ color: '#111827' }}>Lex<span>QCM</span></Link>
    <h1>Mot de passe oublié</h1>
    <p>Nous t’enverrons un lien sécurisé par e-mail.</p>
    {error && <div className="error">{error}</div>}
    {message && <div className="success">{message}</div>}
    <div className="field"><label htmlFor="email">Adresse e-mail</label><input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
    <button className="btn btnPrimary" style={{ width: '100%' }} disabled={loading}>{loading ? 'Envoi…' : 'Envoyer le lien'}</button>
    <Link href="/auth/login" style={{ display: 'block', marginTop: 14, color: '#5146e5', fontWeight: 750 }}>← Retour à la connexion</Link>
  </form></div>
}
