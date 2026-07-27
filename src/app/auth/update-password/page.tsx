'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      router.replace('/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de modifier le mot de passe.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="authWrap"><form className="authCard" onSubmit={submit}>
    <div className="logo" style={{ color: '#111827' }}>Lex<span>QCM</span></div>
    <h1>Nouveau mot de passe</h1>
    <p>Choisis un mot de passe d’au moins 8 caractères.</p>
    {error && <div className="error">{error}</div>}
    <div className="field"><label htmlFor="password">Nouveau mot de passe</label><input id="password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
    <button className="btn btnPrimary" style={{ width: '100%' }} disabled={loading}>{loading ? 'Mise à jour…' : 'Mettre à jour'}</button>
  </form></div>
}
