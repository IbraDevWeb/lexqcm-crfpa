'use client'

import { useEffect, useMemo, useState } from 'react'
import { emptyProgress, isDue, normalizeProgress, recordAnswer, type ProgressState } from '@/lib/progress'

type Question = {
  id: string
  subject: string
  topic: string
  mode?: string
  type?: 'single' | 'multiple'
  difficulty?: number
  stem: string
  options: string[]
  answers: number[]
  explanation?: string
  source?: { label?: string; url?: string; kind?: string }
}

type Session = {
  items: Question[]
  index: number
  score: number
  answers: { id: string; ok: boolean; selected: number[] }[]
  startedAt: number
}

const LOCAL_KEY = 'lexqcm_next_progress_v3'

function shuffle<T>(items: T[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function correct(question: Question, selected: number[]) {
  const a = [...question.answers].sort((x, y) => x - y)
  const b = [...selected].sort((x, y) => x - y)
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export function QuizClient() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [progress, setProgress] = useState<ProgressState>(emptyProgress())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [subject, setSubject] = useState('')
  const [count, setCount] = useState(20)
  const [dueOnly, setDueOnly] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [validated, setValidated] = useState(false)
  const [lastOk, setLastOk] = useState(false)
  const [result, setResult] = useState<{ score: number; total: number; duration: number } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [online, setOnline] = useState(true)

  async function syncCloud(nextProgress: ProgressState) {
    if (!navigator.onLine) return
    setSyncing(true)
    try {
      await fetch('/api/progress', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ progress: nextProgress }),
      })
    } catch {
      // Local progress remains the source of truth until the next online event.
    } finally {
      setSyncing(false)
    }
  }

  function persist(nextProgress: ProgressState) {
    setProgress(nextProgress)
    localStorage.setItem(LOCAL_KEY, JSON.stringify(nextProgress))
    void syncCloud(nextProgress)
  }

  useEffect(() => {
    setOnline(navigator.onLine)
    const onOnline = () => {
      setOnline(true)
      const local = localStorage.getItem(LOCAL_KEY)
      if (local) void syncCloud(normalizeProgress(JSON.parse(local)))
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    const load = async () => {
      try {
        const [qRes, pRes] = await Promise.all([
          fetch('/generated/questions.json', { cache: 'no-store' }),
          fetch('/api/progress', { cache: 'no-store' }),
        ])
        if (!qRes.ok) throw new Error('La banque QCM n’a pas pu être chargée.')
        const bank = await qRes.json()
        setQuestions(Array.isArray(bank) ? bank : [])

        let cloud = emptyProgress()
        if (pRes.ok) {
          const data = await pRes.json()
          cloud = normalizeProgress(data.progress)
        }
        const localRaw = localStorage.getItem(LOCAL_KEY)
        const local = localRaw ? normalizeProgress(JSON.parse(localRaw)) : emptyProgress()
        const chosen = local.answered > cloud.answered ? local : cloud
        setProgress(chosen)
        localStorage.setItem(LOCAL_KEY, JSON.stringify(chosen))
        if (local.answered > cloud.answered) void syncCloud(chosen)
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Erreur de chargement.')
      } finally {
        setLoading(false)
      }
    }
    void load()

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const subjects = useMemo(() => [...new Set(questions.map((q) => q.subject))].sort((a, b) => a.localeCompare(b, 'fr')), [questions])
  const pool = useMemo(() => questions.filter((q) => (!subject || q.subject === subject) && (!dueOnly || isDue(progress, q.id))), [questions, subject, dueOnly, progress])

  function start() {
    if (!pool.length) return
    setResult(null)
    setSelected([])
    setValidated(false)
    setSession({ items: shuffle(pool).slice(0, Math.min(count, pool.length)), index: 0, score: 0, answers: [], startedAt: Date.now() })
  }

  function toggle(index: number) {
    if (!session || validated) return
    const question = session.items[session.index]
    if ((question.type ?? (question.answers.length > 1 ? 'multiple' : 'single')) === 'single') {
      setSelected([index])
    } else {
      setSelected((current) => current.includes(index) ? current.filter((x) => x !== index) : [...current, index])
    }
  }

  function validate() {
    if (!session || !selected.length) return
    const question = session.items[session.index]
    const ok = correct(question, selected)
    const nextProgress = recordAnswer(progress, question, ok)
    persist(nextProgress)
    setLastOk(ok)
    setValidated(true)
    setSession({
      ...session,
      score: session.score + (ok ? 1 : 0),
      answers: [...session.answers, { id: question.id, ok, selected: [...selected] }],
    })
  }

  async function finish(current: Session) {
    const duration = Math.max(1, Math.round((Date.now() - current.startedAt) / 1000))
    setResult({ score: current.score, total: current.items.length, duration })
    setSession(null)
    setSelected([])
    setValidated(false)
    try {
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: dueOnly ? 'review' : 'practice',
          subject: subject || null,
          score: current.score,
          total: current.items.length,
          durationSeconds: duration,
          answers: current.answers,
        }),
      })
    } catch {
      // Session history is secondary to question progress.
    }
  }

  function next() {
    if (!session) return
    if (session.index >= session.items.length - 1) {
      void finish(session)
      return
    }
    setSession({ ...session, index: session.index + 1 })
    setSelected([])
    setValidated(false)
  }

  function toggleFavorite(id: string) {
    const favorites = progress.favorites.includes(id)
      ? progress.favorites.filter((x) => x !== id)
      : [...progress.favorites, id]
    persist({ ...progress, favorites })
  }

  if (loading) return <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}><div className="spinner" /> Chargement de la banque…</div>
  if (loadError) return <div className="error">{loadError}</div>

  if (result) {
    const rate = result.total ? Math.round(result.score / result.total * 100) : 0
    return <div className="quizShell"><div className="card" style={{ textAlign: 'center', padding: 32 }}><span className={`badge ${rate >= 70 ? 'badgeGood' : 'badgeBad'}`}>Session terminée</span><div style={{ fontSize: 58, fontWeight: 900, letterSpacing: '-.06em', margin: '10px 0 0' }}>{result.score}/{result.total}</div><h2>{rate}% de réussite</h2><p className="muted">Les erreurs reviendront plus tôt dans la répétition espacée.</p><div className="actions" style={{ justifyContent: 'center' }}><button className="btn btnPrimary" onClick={start}>Nouvelle série</button><button className="btn btnGhost" onClick={() => setResult(null)}>Modifier les filtres</button></div></div></div>
  }

  if (!session) return <>
    <div className="top"><div><h1>Entraînement</h1><p>{questions.length.toLocaleString('fr-FR')} questions chargées depuis la banque LexQCM.</p></div><span className="badge"><span className="offlineDot" style={{ background: online ? '#059669' : '#d97706' }} />{online ? (syncing ? 'Synchronisation…' : 'Cloud synchronisé') : 'Mode hors ligne'}</span></div>
    <div className="card">
      <div className="grid">
        <div style={{ gridColumn: 'span 6' }} className="field"><label>Matière</label><select value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">Toutes les matières</option>{subjects.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div style={{ gridColumn: 'span 3' }} className="field"><label>Nombre de questions</label><select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[10,20,30,40,60,100].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
        <div style={{ gridColumn: 'span 3', display: 'flex', alignItems: 'end', paddingBottom: 14 }}><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} /> Révision due</label></div>
      </div>
      <div className="row"><span>Questions correspondant aux filtres</span><b>{pool.length.toLocaleString('fr-FR')}</b></div>
      <div className="actions" style={{ marginTop: 16 }}><button className="btn btnPrimary" disabled={!pool.length} onClick={start}>Démarrer la série</button></div>
    </div>
  </>

  const question = session.items[session.index]
  const isFavorite = progress.favorites.includes(question.id)
  return <div className="quizShell">
    <div className="quizTop"><button className="btn btnSoft" onClick={() => setSession(null)}>← Quitter</button><span /><div className="right">{session.index + 1}/{session.items.length}</div></div>
    <div className="progress"><i style={{ width: `${((session.index + (validated ? 1 : 0)) / session.items.length) * 100}%` }} /></div>
    <div className="card questionCard">
      <div className="meta"><span className="badge badgeBrand">{question.subject}</span><span className="badge">{question.topic}</span>{question.difficulty ? <span className="badge">Niveau {question.difficulty}</span> : null}</div>
      <h2>{question.stem}</h2>
      <p className="muted" style={{ fontSize: 12 }}>{question.answers.length > 1 ? 'Plusieurs réponses peuvent être exactes.' : 'Une seule réponse est attendue.'}</p>
      <div>{question.options.map((option, index) => {
        let className = 'option'
        if (!validated && selected.includes(index)) className += ' selected'
        if (validated && question.answers.includes(index)) className += ' correct'
        else if (validated && selected.includes(index)) className += ' wrong'
        return <button key={index} className={className} onClick={() => toggle(index)}><span className="letter">{String.fromCharCode(65 + index)}</span><span>{option}</span></button>
      })}</div>
      {validated && <div className={`feedback ${lastOk ? '' : 'bad'}`}><b>{lastOk ? '✓ Bonne réponse' : 'À revoir'}</b><div style={{ marginTop: 6 }}>{question.explanation || 'Correction enregistrée.'}</div>{question.source?.label && <div className="muted" style={{ fontSize: 11, marginTop: 9 }}>Source : {question.source.label}</div>}</div>}
      <div className="quizActions"><button className="btn btnSoft" onClick={() => toggleFavorite(question.id)}>{isFavorite ? '★ Favori' : '☆ Favori'}</button>{validated ? <button className="btn btnPrimary" onClick={next}>{session.index === session.items.length - 1 ? 'Voir le résultat' : 'Question suivante'}</button> : <button className="btn btnPrimary" disabled={!selected.length} onClick={validate}>Valider</button>}</div>
    </div>
  </div>
}
