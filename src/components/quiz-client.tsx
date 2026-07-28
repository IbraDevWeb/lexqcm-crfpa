'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { isDue, questionStat, recordAnswer } from '@/lib/progress'
import { modeLabel, type LexQuestion } from '@/lib/catalog'
import { useProgress } from '@/lib/use-progress'
import { TopicPicker } from '@/components/topic-picker'

type Session = {
  items: LexQuestion[]
  index: number
  score: number
  answers: { id: string; ok: boolean; selected: number[] }[]
  startedAt: number
  timed: boolean
}

const CUSTOM_KEY = 'lexqcm_custom_questions_v1'

function shuffle<T>(items: T[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function correct(question: LexQuestion, selected: number[]) {
  const a = [...question.answers].sort((x, y) => x - y)
  const b = [...selected].sort((x, y) => x - y)
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function formatTime(total: number) {
  const seconds = Math.max(0, Math.floor(total))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function QuizClient() {
  const searchParams = useSearchParams()
  const requestedMode = searchParams.get('mode') || ''
  const { progress, persist, loading: progressLoading, syncing, online, error: progressError } = useProgress()
  const [questions, setQuestions] = useState<LexQuestion[]>([])
  const [loadingBank, setLoadingBank] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [subject, setSubject] = useState('')
  const [topicsSelected, setTopicsSelected] = useState<string[]>([])
  const [mode, setMode] = useState(requestedMode === 'update' ? 'update' : '')
  const [difficulty, setDifficulty] = useState('')
  const [type, setType] = useState('')
  const [count, setCount] = useState(20)
  const [dueOnly, setDueOnly] = useState(false)
  const [timed, setTimed] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [validated, setValidated] = useState(false)
  const [lastOk, setLastOk] = useState(false)
  const [result, setResult] = useState<{ score: number; total: number; duration: number } | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/generated/questions.json', { cache: 'no-store' })
        if (!response.ok) throw new Error('La banque QCM n’a pas pu être chargée.')
        const bank = await response.json()
        let custom: LexQuestion[] = []
        try {
          const raw = localStorage.getItem(CUSTOM_KEY)
          const parsed = raw ? JSON.parse(raw) : []
          custom = Array.isArray(parsed) ? parsed : []
        } catch {}
        setQuestions([...(Array.isArray(bank) ? bank : []), ...custom])
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Erreur de chargement.')
      } finally {
        setLoadingBank(false)
      }
    }
    void load()
  }, [])

  useEffect(() => {
    if (!session?.timed) return
    setSecondsLeft(session.items.length * 90)
  }, [session?.timed, session?.items.length, session?.startedAt])

  useEffect(() => {
    if (!session?.timed) return
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer)
          setTimeout(() => void finishTimedOut(), 0)
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.startedAt, session?.timed])

  const subjects = useMemo(() => [...new Set(questions.map((q) => q.subject))].sort((a, b) => a.localeCompare(b, 'fr')), [questions])
  const topics = useMemo(() => {
    if (!subject) return []
    const counts = new Map<string, number>()
    questions.filter((q) => q.subject === subject).forEach((q) => counts.set(q.topic, (counts.get(q.topic) || 0) + 1))
    return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value, 'fr'))
  }, [questions, subject])

  const basePool = useMemo(() => questions.filter((q) =>
    (!subject || q.subject === subject) &&
    (!topicsSelected.length || topicsSelected.includes(q.topic)) &&
    (!mode || q.mode === mode) &&
    (!difficulty || String(q.difficulty ?? '') === difficulty) &&
    (!type || (q.type ?? (q.answers.length > 1 ? 'multiple' : 'single')) === type) &&
    (!dueOnly || isDue(progress, q.id)),
  ), [questions, subject, topicsSelected, mode, difficulty, type, dueOnly, progress])

  const errorIds = useMemo(() => new Set(Object.entries(progress.questionStats).filter(([, stat]) => stat.wrong > 0 && (stat.correct === 0 || stat.wrong >= stat.correct)).map(([id]) => id)), [progress.questionStats])
  const favoriteIds = useMemo(() => new Set(progress.favorites), [progress.favorites])

  function makePool(kind = requestedMode) {
    if (kind === 'errors') return questions.filter((q) => errorIds.has(q.id))
    if (kind === 'favorites') return questions.filter((q) => favoriteIds.has(q.id))
    if (kind === 'update') return questions.filter((q) => q.mode === 'update')
    if (kind === 'adaptive') {
      const due = questions.filter((q) => isDue(progress, q.id))
      const source = due.length >= 20 ? due : questions
      return [...source].sort((a, b) => {
        const A = questionStat(progress, a.id)
        const B = questionStat(progress, b.id)
        return (B.wrong - B.correct) - (A.wrong - A.correct)
      }).slice(0, 300)
    }
    return basePool
  }

  function start(kind = '') {
    const pool = makePool(kind || requestedMode)
    if (!pool.length) return
    setResult(null)
    setSelected([])
    setValidated(false)
    const items = shuffle(pool).slice(0, Math.min(count, pool.length))
    setSession({ items, index: 0, score: 0, answers: [], startedAt: Date.now(), timed })
  }

  function toggle(index: number) {
    if (!session || validated) return
    const question = session.items[session.index]
    if ((question.type ?? (question.answers.length > 1 ? 'multiple' : 'single')) === 'single') setSelected([index])
    else setSelected((current) => current.includes(index) ? current.filter((x) => x !== index) : [...current, index])
  }

  function validate() {
    if (!session || !selected.length) return
    const question = session.items[session.index]
    const ok = correct(question, selected)
    const nextProgress = recordAnswer(progress, question, ok)
    persist(nextProgress)
    const nextSession = { ...session, score: session.score + (ok ? 1 : 0), answers: [...session.answers, { id: question.id, ok, selected: [...selected] }] }
    setSession(nextSession)
    setLastOk(ok)
    if (session.timed) {
      if (session.index >= session.items.length - 1) void finish(nextSession)
      else { setSession({ ...nextSession, index: session.index + 1 }); setSelected([]); setValidated(false) }
      return
    }
    setValidated(true)
  }

  async function finish(current: Session) {
    const duration = Math.max(1, Math.round((Date.now() - current.startedAt) / 1000))
    setResult({ score: current.score, total: current.items.length, duration })
    setSession(null); setSelected([]); setValidated(false)
    try {
      await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: current.timed ? 'exam' : (dueOnly ? 'review' : 'practice'), subject: subject || null, score: current.score, total: current.items.length, durationSeconds: duration, answers: current.answers }) })
    } catch {}
  }

  async function finishTimedOut() {
    if (session?.timed) await finish(session)
  }

  function next() {
    if (!session) return
    if (session.index >= session.items.length - 1) { void finish(session); return }
    setSession({ ...session, index: session.index + 1 }); setSelected([]); setValidated(false)
  }

  function toggleFavorite(id: string) {
    const favorites = progress.favorites.includes(id) ? progress.favorites.filter((x) => x !== id) : [...progress.favorites, id]
    persist({ ...progress, favorites })
  }

  if (loadingBank || progressLoading) return <div className="card loadingCard"><div className="spinner" /> Chargement de la banque…</div>
  if (loadError || progressError) return <div className="error">{loadError || progressError}</div>

  if (result) {
    const rate = result.total ? Math.round(result.score / result.total * 100) : 0
    return <div className="quizShell"><div className="card resultCard"><span className={`badge ${rate >= 70 ? 'badgeGood' : 'badgeBad'}`}>Session terminée</span><div className="resultScore">{result.score}/{result.total}</div><h2>{rate}% de réussite</h2><p className="muted">Les erreurs reviendront plus tôt dans la répétition espacée.</p><div className="resultMiniGrid"><div><b>{result.total - result.score}</b><span>erreurs</span></div><div><b>{formatTime(result.duration)}</b><span>temps</span></div><div><b>{progress.streak}</b><span>jours de série</span></div></div><div className="actions centerActions"><button className="btn btnPrimary" onClick={() => start()}>Nouvelle série</button><button className="btn btnSoft" onClick={() => { setResult(null); setSession(null) }}>Modifier les filtres</button></div></div></div>
  }

  if (!session) {
    const specialLabel = requestedMode === 'errors' ? 'Mode erreurs' : requestedMode === 'favorites' ? 'Mode favoris' : requestedMode === 'update' ? 'Actualisations 2026' : requestedMode === 'adaptive' ? 'Révision adaptative' : ''
    const poolCount = makePool(requestedMode).length
    const selectedLabel = topicsSelected.length ? `${topicsSelected.length} thème${topicsSelected.length > 1 ? 's' : ''} · ` : ''
    return <>
      <div className="top"><div><h1>Entraînement</h1><p>{questions.length.toLocaleString('fr-FR')} questions chargées. Configure une série exactement comme dans la V1.</p></div><span className="badge"><span className="offlineDot" style={{ background: online ? '#059669' : '#d97706' }} />{online ? (syncing ? 'Synchronisation…' : 'Cloud synchronisé') : 'Mode hors ligne'}</span></div>
      {specialLabel && <div className="alert info"><b>{specialLabel}</b> · {poolCount} question{poolCount > 1 ? 's' : ''} disponible{poolCount > 1 ? 's' : ''}.</div>}
      <div className="card trainingSetup"><div className="formGrid">
        <div className="field"><label>Matière</label><select value={subject} onChange={(e) => { setSubject(e.target.value); setTopicsSelected([]) }}><option value="">Toutes les matières</option>{subjects.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="field"><label>Chapitres / thèmes</label><TopicPicker options={topics} value={topicsSelected} disabled={!subject} onChange={setTopicsSelected} /></div>
        <div className="field"><label>Mode</label><select value={mode} onChange={(e) => setMode(e.target.value)}><option value="">Tout mélanger</option><option value="curated">QCM validés</option><option value="case">Cas pratiques</option><option value="synthesis">QRM synthèse</option><option value="drill">Drills mémoire</option><option value="update">Actualisations 2026</option></select></div>
        <div className="field"><label>Difficulté</label><select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="">Toutes</option>{[1,2,3,4].map((n) => <option key={n} value={n}>Niveau {n}</option>)}</select></div>
        <div className="field"><label>Type</label><select value={type} onChange={(e) => setType(e.target.value)}><option value="">QCM + QRM</option><option value="single">Réponse unique</option><option value="multiple">Réponses multiples</option></select></div>
        <div className="field"><label>Nombre de questions</label><select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[10,20,30,40,60,100].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
      </div>
      <div className="checkGrid"><label><input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} /> Uniquement les questions dues / à revoir</label><label><input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} /> Mode examen chronométré · 1 min 30 par question</label></div>
      <div className="setupNote">{selectedLabel}{(requestedMode ? poolCount : basePool.length).toLocaleString('fr-FR')} questions correspondent à la sélection.</div>
      <div className="practiceLaunch"><button className="btn btnPrimary" disabled={!(requestedMode ? poolCount : basePool.length)} onClick={() => start()}>Démarrer</button><button className="btn btnSoft" disabled={!errorIds.size} onClick={() => start('errors')}>Rejouer mes erreurs</button><button className="btn btnGhost" disabled={!favoriteIds.size} onClick={() => start('favorites')}>Mes favoris</button><button className="btn btnGhost" onClick={() => start('adaptive')}>Révision adaptative</button></div></div>
    </>
  }

  const question = session.items[session.index]
  const isFavorite = progress.favorites.includes(question.id)
  const sourceKind = question.source?.kind === 'official' || question.mode === 'update' ? 'Officiel / actualisé' : 'Cours / corrigé'
  return <div className="quizShell">
    <div className="quizTop"><button className="btn btnSoft" onClick={() => setSession(null)}>← Quitter</button>{session.timed ? <span className="timer">⏱ {formatTime(secondsLeft)}</span> : <span /> }<div className="right">{session.index + 1}/{session.items.length}</div></div>
    <div className="progress"><i style={{ width: `${((session.index + (validated ? 1 : 0)) / session.items.length) * 100}%` }} /></div>
    <div className="card questionCard">
      <div className="meta"><span className="badge badgeBrand">{question.subject}</span><span className="badge">{question.topic}</span>{question.difficulty ? <span className="badge badgeWarn">Niveau {question.difficulty}</span> : null}<span className="badge">{modeLabel(question.mode)}</span><span className="badge">{sourceKind}</span></div>
      <h2>{question.stem}</h2><p className="questionInstruction">{question.answers.length > 1 ? 'Plusieurs réponses peuvent être exactes.' : 'Une seule réponse est attendue.'}</p>
      <div>{question.options.map((option, index) => { let className = 'option'; if (!validated && selected.includes(index)) className += ' selected'; if (validated && question.answers.includes(index)) className += ' correct'; else if (validated && selected.includes(index)) className += ' wrong'; return <button key={index} className={className} onClick={() => toggle(index)}><span className="letter">{String.fromCharCode(65 + index)}</span><span>{option}</span></button> })}</div>
      {validated && !session.timed && <div className={`feedback ${lastOk ? '' : 'bad'}`}><b>{lastOk ? '✓ Bonne réponse' : 'À revoir'}</b><div className="feedbackText">{question.explanation || 'Correction enregistrée.'}</div>{question.optionExplanations?.map((text, i) => text ? <div className="optionExplanation" key={i}><b>{String.fromCharCode(65 + i)}.</b> {text}</div> : null)}{question.source?.label && <div className="sourceLine">Source : {question.source.label}{question.source.url ? <> · <a href={question.source.url} target="_blank" rel="noreferrer">ouvrir</a></> : null}</div>}</div>}
      <div className="quizActions"><button className="btn btnSoft" onClick={() => toggleFavorite(question.id)}>{isFavorite ? '★ Favori' : '☆ Favori'}</button>{validated && !session.timed ? <button className="btn btnPrimary" onClick={next}>{session.index === session.items.length - 1 ? 'Voir le résultat' : 'Question suivante'}</button> : <button className="btn btnPrimary" disabled={!selected.length} onClick={validate}>{session.timed ? 'Enregistrer' : 'Valider'}</button>}</div>
    </div>
  </div>
}
