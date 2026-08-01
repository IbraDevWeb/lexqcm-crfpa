'use client'

import { ChangeEvent, useState } from 'react'
import { normalizeProgress } from '@/lib/progress'
import { PROGRESS_LOCAL_KEY } from '@/lib/use-progress'
import type { LexQuestion } from '@/lib/catalog'

const CUSTOM_KEY = 'lexqcm_custom_questions_v1'

function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

export function DataClient() {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function exportProgress() {
    setError('')
    const response = await fetch('/api/progress', { cache: 'no-store' })
    if (!response.ok) return setError('Impossible de récupérer la progression cloud.')
    const data = await response.json()
    downloadJson(`lexqcm-progression-${new Date().toISOString().slice(0, 10)}.json`, data.progress)
  }

  async function importProgress(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true); setMessage(''); setError('')
    try {
      const parsed = normalizeProgress(JSON.parse(await file.text()))
      const response = await fetch('/api/progress', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: parsed }),
      })
      if (!response.ok) throw new Error('Import de progression impossible.')
      localStorage.setItem(PROGRESS_LOCAL_KEY, JSON.stringify(parsed))
      setMessage(`Progression importée : ${parsed.answered} réponses et ${parsed.caseHistory.length} étapes de dossiers.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fichier de progression invalide.')
    } finally { setBusy(false) }
  }

  async function exportBank() {
    setError('')
    try {
      const response = await fetch('/generated/questions.json', { cache: 'no-store' })
      if (!response.ok) throw new Error('Banque indisponible.')
      const bank = await response.json()
      const customRaw = localStorage.getItem(CUSTOM_KEY)
      const custom = customRaw ? JSON.parse(customRaw) : []
      downloadJson('lexqcm-banque-complete.json', [...(Array.isArray(bank) ? bank : []), ...(Array.isArray(custom) ? custom : [])])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export impossible.')
    }
  }

  async function importQuestions(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMessage(''); setError('')
    try {
      const parsed = JSON.parse(await file.text())
      if (!Array.isArray(parsed)) throw new Error('Le fichier doit contenir un tableau JSON.')
      const valid = parsed.filter((q: Partial<LexQuestion>) => typeof q.id === 'string' && typeof q.subject === 'string' && typeof q.topic === 'string' && typeof q.stem === 'string' && Array.isArray(q.options) && Array.isArray(q.answers))
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(valid))
      setMessage(`${valid.length} question${valid.length > 1 ? 's' : ''} personnalisée${valid.length > 1 ? 's' : ''} enregistrée${valid.length > 1 ? 's' : ''} sur cet appareil.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Banque JSON invalide.')
    }
  }

  async function resetProgress() {
    if (!window.confirm('Effacer toute ta progression LexQCM synchronisée ? Cette action remettra aussi les statistiques cloud à zéro.')) return
    setBusy(true); setError(''); setMessage('')
    try {
      const progress = normalizeProgress({})
      const response = await fetch('/api/progress', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress }) })
      if (!response.ok) throw new Error('Réinitialisation impossible.')
      localStorage.setItem(PROGRESS_LOCAL_KEY, JSON.stringify(progress))
      setMessage('Progression remise à zéro.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Réinitialisation impossible.')
    } finally { setBusy(false) }
  }

  return <>
    <div className="top"><div><h1>Données</h1><p>Sauvegarde, restauration et outils de banque, comme dans la V1 — avec la progression désormais liée à ton compte.</p></div></div>
    {error && <div className="error">{error}</div>}
    {message && <div className="success">{message}</div>}
    <div className="dataGrid">
      <section className="card"><h2>Sauvegarde de progression</h2><p className="muted">Exporte une copie JSON de tes statistiques, erreurs, favoris, répétitions espacées et dossiers progressifs.</p><div className="actions"><button className="btn btnPrimary" onClick={exportProgress}>Exporter ma progression</button><label className="btn btnSoft fileButton">Importer<input type="file" accept="application/json,.json" onChange={importProgress} disabled={busy} /></label></div></section>
      <section className="card"><h2>Banque QCM</h2><p className="muted">Exporte la banque ou conserve localement une banque personnalisée au format LexQCM.</p><div className="actions"><button className="btn btnGhost" onClick={exportBank}>Exporter la banque complète</button><label className="btn btnSoft fileButton">Importer des QCM<input type="file" accept="application/json,.json" onChange={importQuestions} /></label></div><p className="microNote">Les questions personnalisées restent sur l’appareil et ne sont pas publiées sur GitHub.</p></section>
      <section className="card dangerCard"><h2>Remise à zéro</h2><p>Efface les statistiques, erreurs, favoris et répétitions espacées de ton compte LexQCM.</p><button className="btn btnDanger" onClick={resetProgress} disabled={busy}>Réinitialiser ma progression</button></section>
    </div>
  </>
}
