'use client'

import { useEffect, useState } from 'react'
import { emptyProgress, normalizeProgress, recordAnswer, type ProgressState } from '@/lib/progress'

type CaseQuestion = {
  id: string
  phase?: string
  stem: string
  options: string[]
  answers: number[]
  explanation?: string
  reasoning?: string
  legalRefs?: string[]
}

type CaseItem = {
  id: string
  title: string
  provider?: string
  topic?: string
  scenario: string
  status?: string
  warning?: string
  questions: CaseQuestion[]
}

const LOCAL_KEY = 'lexqcm_next_progress_v3'

function isCorrect(q: CaseQuestion, selected: number[]) {
  const a = [...q.answers].sort((x, y) => x - y)
  const b = [...selected].sort((x, y) => x - y)
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export function CaseClient() {
  const [cases, setCases] = useState<CaseItem[]>([])
  const [progress, setProgress] = useState<ProgressState>(emptyProgress())
  const [active, setActive] = useState<CaseItem | null>(null)
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number[]>([])
  const [validated, setValidated] = useState(false)
  const [score, setScore] = useState(0)
  const [startedAt, setStartedAt] = useState(0)
  const [done, setDone] = useState<{ score: number; total: number } | null>(null)
  const [loading, setLoading] = useState(true)

  async function sync(next: ProgressState) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
    setProgress(next)
    if (!navigator.onLine) return
    try {
      await fetch('/api/progress', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: next }) })
    } catch {}
  }

  useEffect(() => {
    const load = async () => {
      try {
        const [caseRes, progressRes] = await Promise.all([fetch('/generated/cases.json', { cache: 'no-store' }), fetch('/api/progress', { cache: 'no-store' })])
        if (caseRes.ok) {
          const value = await caseRes.json()
          setCases(Array.isArray(value) ? value : [])
        }
        if (progressRes.ok) {
          const value = await progressRes.json()
          const cloud = normalizeProgress(value.progress)
          const localRaw = localStorage.getItem(LOCAL_KEY)
          const local = localRaw ? normalizeProgress(JSON.parse(localRaw)) : emptyProgress()
          setProgress(local.answered > cloud.answered ? local : cloud)
        }
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  function start(item: CaseItem) {
    if (!item.questions?.length) return
    setActive(item)
    setIndex(0)
    setSelected([])
    setValidated(false)
    setScore(0)
    setDone(null)
    setStartedAt(Date.now())
  }

  function toggle(option: number) {
    if (!active || validated) return
    const q = active.questions[index]
    if (q.answers.length <= 1) setSelected([option])
    else setSelected((current) => current.includes(option) ? current.filter((x) => x !== option) : [...current, option])
  }

  function validate() {
    if (!active || !selected.length) return
    const q = active.questions[index]
    const ok = isCorrect(q, selected)
    const next = recordAnswer(progress, { id: q.id, subject: 'Dossiers progressifs', topic: active.title }, ok)
    void sync(next)
    if (ok) setScore((x) => x + 1)
    setValidated(true)
  }

  async function finish() {
    if (!active) return
    const total = active.questions.length
    const finalScore = score
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    setDone({ score: finalScore, total })
    try {
      await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'case', subject: active.title, score: finalScore, total, durationSeconds, answers: [] }) })
    } catch {}
    setActive(null)
  }

  function next() {
    if (!active) return
    if (index === active.questions.length - 1) {
      void finish()
      return
    }
    setIndex((x) => x + 1)
    setSelected([])
    setValidated(false)
  }

  if (loading) return <div className="card"><div className="spinner" /> Chargement des dossiers…</div>

  if (done) {
    const pct = done.total ? Math.round(done.score / done.total * 100) : 0
    return <div className="card" style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto' }}><span className="badge badgeGood">Dossier terminé</span><div style={{ fontSize: 58, fontWeight: 900, letterSpacing: '-.06em' }}>{done.score}/{done.total}</div><h2>{pct}% de réussite</h2><button className="btn btnPrimary" onClick={() => setDone(null)}>Tous les dossiers</button></div>
  }

  if (!active) return <>
    <div className="top"><div><h1>Dossiers progressifs</h1><p>Cas pratiques issus de ta banque 2026, avec raisonnement étape par étape.</p></div><span className="badge badgeBrand">{cases.filter((c) => c.status !== 'source_only').length} corrigés</span></div>
    {cases.length ? <div className="grid">{cases.map((item) => <article key={item.id} className="card" style={{ gridColumn: 'span 6', display: 'flex', flexDirection: 'column' }}><div className="meta"><span className="badge badgeBrand">{item.provider || 'LexQCM'}</span><span className="badge">{item.questions?.length || 0} étapes</span>{item.status === 'source_only' && <span className="badge">Sujet seul</span>}</div><h3 style={{ fontSize: 20, marginBottom: 8 }}>{item.title}</h3><p className="muted" style={{ flex: 1 }}>{item.scenario.slice(0, 280)}{item.scenario.length > 280 ? '…' : ''}</p>{item.warning && <div className="error" style={{ marginBottom: 10 }}>{item.warning}</div>}<button className="btn btnPrimary" disabled={!item.questions?.length || item.status === 'source_only'} onClick={() => start(item)}>{item.status === 'source_only' ? 'Corrigé requis' : 'Commencer'}</button></article>)}</div> : <div className="card"><p className="muted">Aucun dossier n’a été détecté dans la banque legacy. Le script d’import affichera le nombre de dossiers pendant le build Vercel.</p></div>}
  </>

  const q = active.questions[index]
  const ok = validated ? isCorrect(q, selected) : false
  return <div>
    <div className="quizTop"><button className="btn btnSoft" onClick={() => setActive(null)}>← Dossiers</button><span /><div className="right">{index + 1}/{active.questions.length}</div></div>
    <div className="progress"><i style={{ width: `${((index + (validated ? 1 : 0)) / active.questions.length) * 100}%` }} /></div>
    <div className="grid" style={{ alignItems: 'start' }}>
      <aside className="card" style={{ gridColumn: 'span 5', maxHeight: '72dvh', overflow: 'auto', position: 'sticky', top: 20 }}><div className="meta"><span className="badge badgeBrand">{active.provider || 'LexQCM'}</span><span className="badge">{active.topic || 'Cas pratique'}</span></div><h2>Énoncé</h2><p style={{ whiteSpace: 'pre-line' }}>{active.scenario}</p></aside>
      <section className="card questionCard" style={{ gridColumn: 'span 7', marginTop: 0 }}><div className="meta">{q.phase && <span className="badge badgeBrand">{q.phase}</span>}</div><h2>{q.stem}</h2>{q.options.map((option, optionIndex) => { let cls = 'option'; if (!validated && selected.includes(optionIndex)) cls += ' selected'; if (validated && q.answers.includes(optionIndex)) cls += ' correct'; else if (validated && selected.includes(optionIndex)) cls += ' wrong'; return <button key={optionIndex} className={cls} onClick={() => toggle(optionIndex)}><span className="letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option}</span></button> })}{validated && <div className={`feedback ${ok ? '' : 'bad'}`}><b>{ok ? '✓ Bonne analyse' : 'À reprendre'}</b><p>{q.explanation || 'Correction enregistrée.'}</p>{q.reasoning && <><b>Raisonnement attendu</b><p>{q.reasoning}</p></>}{q.legalRefs?.length ? <div className="meta">{q.legalRefs.map((ref) => <span className="badge" key={ref}>{ref}</span>)}</div> : null}</div>}<div className="quizActions"><span className="muted">{q.answers.length > 1 ? 'Plusieurs réponses possibles' : 'Une réponse attendue'}</span>{validated ? <button className="btn btnPrimary" onClick={next}>{index === active.questions.length - 1 ? 'Bilan du dossier' : 'Étape suivante'}</button> : <button className="btn btnPrimary" disabled={!selected.length} onClick={validate}>Valider</button>}</div></section>
    </div>
  </div>
}
