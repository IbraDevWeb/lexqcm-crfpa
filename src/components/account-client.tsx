'use client'

import { ChangeEvent, FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizeProgress } from '@/lib/progress'

export function AccountClient({ initialName, email }: { initialName: string; email: string }) {
  const [name, setName] = useState(initialName)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Session expirée.')
      const { error: updateError } = await supabase.from('profiles').upsert({ id: user.id, display_name: name.trim() || null, updated_at: new Date().toISOString() })
      if (updateError) throw updateError
      setMessage('Profil mis à jour.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de mettre à jour le profil.')
    } finally {
      setBusy(false)
    }
  }

  async function exportProgress() {
    setError('')
    const response = await fetch('/api/progress', { cache: 'no-store' })
    if (!response.ok) return setError('Impossible de récupérer la progression.')
    const data = await response.json()
    const blob = new Blob([JSON.stringify(data.progress, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lexqcm-progression-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importProgress(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const text = await file.text()
      const parsed = normalizeProgress(JSON.parse(text))
      const response = await fetch('/api/progress', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ progress: parsed }),
      })
      if (!response.ok) throw new Error('Import impossible.')
      localStorage.setItem('lexqcm_next_progress_v3', JSON.stringify(parsed))
      setMessage(`Progression importée : ${parsed.answered} réponses.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fichier de progression invalide.')
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }

  return <div className="grid">
    <section className="card wide">
      <h2 style={{ marginTop: 0 }}>Profil</h2>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      <form onSubmit={saveProfile}>
        <div className="field"><label>Adresse e-mail</label><input value={email} disabled /></div>
        <div className="field"><label htmlFor="displayName">Nom affiché</label><input id="displayName" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <button className="btn btnPrimary" disabled={busy}>Enregistrer</button>
      </form>
    </section>
    <section className="card side">
      <h2 style={{ marginTop: 0 }}>Données</h2>
      <p className="muted">Export pratique pour sauvegarder ta progression ou migrer depuis une ancienne version.</p>
      <div className="actions"><button className="btn btnSoft" onClick={exportProgress}>Exporter ma progression</button></div>
      <div className="field" style={{ marginTop: 18 }}><label htmlFor="progressFile">Importer un fichier JSON</label><input className="fileInput" id="progressFile" type="file" accept="application/json,.json" onChange={importProgress} disabled={busy} /></div>
      <p className="muted" style={{ fontSize: 11 }}>L’import remplace la progression cloud actuelle. Fais un export avant si nécessaire.</p>
    </section>
  </div>
}
