'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ExamSession } from '@/components/exam-session'
import { TopicPicker } from '@/components/topic-picker'
import { isDue, questionStat, recordAnswer } from '@/lib/progress'
import { modeLabel, type LexQuestion } from '@/lib/catalog'
import { useProgress } from '@/lib/use-progress'

type PracticeSession = {
  items: LexQuestion[]
  index: number
  score: number
  answers: { id: string; ok: boolean; selected: number[] }[]
  startedAt: number
}

type PracticeResult = {
  score: number
  total: number
  duration: number
  wrong: number
}

const CUSTOM_KEY = 'lexqcm_custom_questions_v1'

function shuffle<T>(items: T[]) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index--) {
    const random = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[random]] = [copy[random], copy[index]]
  }
  return copy
}

function balancedSample(items: LexQuestion[], count: number) {
  const groups = new Map<string, LexQuestion[]>()
  shuffle(items).forEach((question) => {
    const current = groups.get(question.subject) ?? []
    current.push(question)
    groups.set(question.subject, current)
  })
  const subjects = shuffle([...groups.keys()])
  const result: LexQuestion[] = []
  let cursor = 0
  while (result.length < count && subjects.length) {
    const subject = subjects[cursor % subjects.length]
    const group = groups.get(subject) ?? []
    const question = group.shift()
    if (question) result.push(question)
    if (!group.length) {
      groups.delete(subject)
      subjects.splice(cursor % subjects.length, 1)
      if (!subjects.length) break
      cursor = cursor % subjects.length
    } else cursor += 1
  }
  return result
}

function correct(question: LexQuestion, selected: number[]) {
  const expected = [...question.answers].sort((a, b) => a - b)
  const actual = [...selected].sort((a, b) => a - b)
  return expected.length === actual.length && expected.every((value, index) => value === actual[index])
}

function formatTime(total: number) {
  const seconds = Math.max(0, Math.floor(total))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = seconds % 60
  return hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}

export function QuizClient() {
  const searchParams = useSearchParams()
  const requestedMode = searchParams.get('mode') || ''
  const requestedPreset = searchParams.get('preset') || ''
  const { progress, persist, loading: progressLoading, syncing, online, error: progressError } = useProgress()
  const [questions, setQuestions] = useState<LexQuestion[]>([])
  const [loadingBank, setLoadingBank] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [launchMessage, setLaunchMessage] = useState('')
  const [subject, setSubject] = useState('')
  const [topicsSelected, setTopicsSelected] = useState<string[]>([])
  const [mode, setMode] = useState(requestedMode === 'update' ? 'update' : '')
  const [difficulty, setDifficulty] = useState('')
  const [type, setType] = useState('')
  const [count, setCount] = useState(20)
  const [dueOnly, setDueOnly] = useState(false)
  const [sessionMode, setSessionMode] = useState<'practice' | 'exam'>('practice')
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null)
  const [examItems, setExamItems] = useState<LexQuestion[] | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [validated, setValidated] = useState(false)
  const [lastOk, setLastOk] = useState(false)
  const [result, setResult] = useState<PracticeResult | null>(null)
  const [autoStarted, setAutoStarted] = useState(false)

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

  const subjects = useMemo(() => [...new Set(questions.map((question) => question.subject))].sort((a, b) => a.localeCompare(b, 'fr')), [questions])
  const topics = useMemo(() => {
    if (!subject) return []
    const counts = new Map<string, number>()
    questions.filter((question) => question.subject === subject).forEach((question) => counts.set(question.topic, (counts.get(question.topic) || 0) + 1))
    return [...counts.entries()].map(([value, topicCount]) => ({ value, count: topicCount })).sort((a, b) => a.value.localeCompare(b.value, 'fr'))
  }, [questions, subject])

  const dueQuestions = useMemo(() => questions.filter((question) => {
    const stat = progress.questionStats[question.id]
    return Boolean(stat?.seen) && isDue(progress, question.id)
  }), [questions, progress])
  const errorIds = useMemo(() => new Set(Object.entries(progress.questionStats).filter(([, stat]) => stat.wrong > 0 && (stat.correct === 0 || stat.wrong >= stat.correct)).map(([id]) => id)), [progress.questionStats])
  const favoriteIds = useMemo(() => new Set(progress.favorites), [progress.favorites])

  const basePool = useMemo(() => questions.filter((question) => {
    const stat = progress.questionStats[question.id]
    return (!subject || question.subject === subject) &&
      (!topicsSelected.length || topicsSelected.includes(question.topic)) &&
      (!mode || question.mode === mode) &&
      (!difficulty || String(question.difficulty ?? '') === difficulty) &&
      (!type || (question.type ?? (question.answers.length > 1 ? 'multiple' : 'single')) === type) &&
      (!dueOnly || (Boolean(stat?.seen) && isDue(progress, question.id)))
  }), [questions, subject, topicsSelected, mode, difficulty, type, dueOnly, progress])

  function makePool(kind = requestedMode) {
    if (kind === 'errors') return questions.filter((question) => errorIds.has(question.id))
    if (kind === 'favorites') return questions.filter((question) => favoriteIds.has(question.id))
    if (kind === 'update') return questions.filter((question) => question.mode === 'update')
    if (kind === 'due') return dueQuestions
    if (kind === 'adaptive') {
      const fragile = questions.filter((question) => errorIds.has(question.id))
      const source = dueQuestions.length >= 20 ? dueQuestions : fragile.length >= 20 ? fragile : questions
      return [...source].sort((a, b) => {
        const first = questionStat(progress, a.id)
        const second = questionStat(progress, b.id)
        return (second.wrong - second.correct) - (first.wrong - first.correct)
      }).slice(0, 400)
    }
    return basePool
  }

  function startPractice(kind = '', overrideCount?: number, explicitPool?: LexQuestion[]) {
    const pool = explicitPool ?? makePool(kind || requestedMode)
    if (!pool.length) {
      setLaunchMessage(kind === 'errors' ? 'Tu n’as pas encore d’erreur active à réviser.' : kind === 'due' ? 'Aucune révision n’est due pour le moment.' : 'Aucune question ne correspond à cette sélection.')
      return
    }
    setLaunchMessage('')
    setResult(null)
    setSelected([])
    setValidated(false)
    const target = overrideCount ?? count
    const items = shuffle(pool).slice(0, Math.min(target, pool.length))
    setPracticeSession({ items, index: 0, score: 0, answers: [], startedAt: Date.now() })
  }

  function startExam(explicitPool = basePool, overrideCount = count) {
    if (!explicitPool.length) {
      setLaunchMessage('Aucune question ne correspond à cette sélection.')
      return
    }
    setLaunchMessage('')
    setResult(null)
    setExamItems(balancedSample(explicitPool, Math.min(overrideCount, explicitPool.length)))
  }

  function launchPreset(preset: string) {
    if (preset === 'quick') startPractice('', 10, questions)
    if (preset === 'exam') startExam(questions, Math.min(100, questions.length))
    if (preset === 'errors') startPractice('errors', Math.min(30, Math.max(10, errorIds.size)))
    if (preset === 'due') startPractice('due', Math.min(30, Math.max(10, dueQuestions.length)))
  }

  useEffect(() => {
    if (loadingBank || progressLoading || autoStarted || !questions.length) return
    if (requestedPreset === 'quick' || requestedPreset === 'exam') {
      setAutoStarted(true)
      launchPreset(requestedPreset)
    } else if (requestedMode === 'errors' || requestedMode === 'due') {
      setAutoStarted(true)
      launchPreset(requestedMode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingBank, progressLoading, questions.length, requestedPreset, requestedMode, autoStarted])

  function toggle(index: number) {
    if (!practiceSession || validated) return
    const question = practiceSession.items[practiceSession.index]
    if ((question.type ?? (question.answers.length > 1 ? 'multiple' : 'single')) === 'single') setSelected([index])
    else setSelected((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])
  }

  function validate() {
    if (!practiceSession || !selected.length) return
    const question = practiceSession.items[practiceSession.index]
    const ok = correct(question, selected)
    persist(recordAnswer(progress, question, ok))
    setPracticeSession({ ...practiceSession, score: practiceSession.score + (ok ? 1 : 0), answers: [...practiceSession.answers, { id: question.id, ok, selected: [...selected] }] })
    setLastOk(ok)
    setValidated(true)
  }

  async function finishPractice(current: PracticeSession) {
    const duration = Math.max(1, Math.round((Date.now() - current.startedAt) / 1000))
    setResult({ score: current.score, total: current.items.length, duration, wrong: current.items.length - current.score })
    setPracticeSession(null)
    setSelected([])
    setValidated(false)
    try {
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: dueOnly ? 'review' : 'practice', subject: subject || null, score: current.score, total: current.items.length, durationSeconds: duration, answers: current.answers }),
      })
    } catch {}
  }

  function next() {
    if (!practiceSession) return
    if (practiceSession.index >= practiceSession.items.length - 1) {
      void finishPractice(practiceSession)
      return
    }
    setPracticeSession({ ...practiceSession, index: practiceSession.index + 1 })
    setSelected([])
    setValidated(false)
  }

  function toggleFavorite(id: string) {
    const favorites = progress.favorites.includes(id) ? progress.favorites.filter((item) => item !== id) : [...progress.favorites, id]
    persist({ ...progress, favorites })
  }

  if (loadingBank || progressLoading) return <div className="card loadingCard"><div className="spinner" /> Chargement de la banque…</div>
  if (loadError || progressError) return <div className="error">{loadError || progressError}</div>

  if (examItems) return <ExamSession questions={examItems} progress={progress} persist={persist} onExit={() => setExamItems(null)} />

  if (result) {
    const rate = result.total ? Math.round((result.score / result.total) * 100) : 0
    return <div className="quizShell"><div className="card resultCard practiceResultCard"><span className={`badge ${rate >= 70 ? 'badgeGood' : 'badgeBad'}`}>Session terminée</span><div className="resultScore">{result.score}/{result.total}</div><h2>{rate}% de réussite</h2><p className="muted">Les erreurs ont été intégrées à ta répétition espacée.</p><div className="resultMiniGrid"><div><b>{result.wrong}</b><span>erreurs</span></div><div><b>{formatTime(result.duration)}</b><span>temps</span></div><div><b>{progress.streak}</b><span>jours de série</span></div></div><div className="actions centerActions"><button className="btn btnPrimary" onClick={() => startPractice()}>Nouvelle série</button><button className="btn btnSoft" onClick={() => setResult(null)}>Modifier les filtres</button><button className="btn btnGhost" onClick={() => launchPreset('errors')}>Revoir mes erreurs</button></div></div></div>
  }

  if (!practiceSession) {
    const specialLabel = requestedMode === 'errors' ? 'Mode erreurs' : requestedMode === 'favorites' ? 'Mode favoris' : requestedMode === 'update' ? 'Actualisations 2026' : requestedMode === 'adaptive' ? 'Révision adaptative' : requestedMode === 'due' ? 'Révisions dues' : ''
    const poolCount = makePool(requestedMode).length
    const selectedLabel = topicsSelected.length ? `${topicsSelected.length} thème${topicsSelected.length > 1 ? 's' : ''} · ` : ''
    return <>
      <div className="top trainingTop"><div><span className="pageKicker">CENTRE D’ENTRAÎNEMENT</span><h1>Choisis ton format de travail</h1><p>Commence immédiatement avec un format prédéfini ou compose une session sur mesure dans les 2 349 QCM/QRM.</p></div><span className="badge"><span className="offlineDot" style={{ background: online ? '#059669' : '#d97706' }} />{online ? (syncing ? 'Synchronisation…' : 'Cloud synchronisé') : 'Mode hors ligne'}</span></div>

      <section className="trainingPresetGrid">
        <button className="trainingPresetCard quick" onClick={() => launchPreset('quick')}><span className="presetIcon">⚡</span><div><span>SÉRIE RAPIDE</span><h2>10 questions pour avancer maintenant</h2><p>Questions mélangées, correction immédiate et mise à jour de la répétition espacée.</p></div><strong>≈ 8 min</strong></button>
        <button className="trainingPresetCard exam" onClick={() => launchPreset('exam')}><span className="presetIcon">◷</span><div><span>EXAMEN BLANC CRFPA</span><h2>Une session longue en conditions réelles</h2><p>100 questions équilibrées, chronomètre, navigation libre et correction uniquement à la fin.</p></div><strong>2 h 30</strong></button>
        <button className="trainingPresetCard errors" disabled={!errorIds.size} onClick={() => launchPreset('errors')}><span className="presetIcon">↻</span><div><span>POINTS FAIBLES</span><h2>Réviser mes erreurs</h2><p>Une série ciblée sur les notions encore fragiles.</p></div><strong>{errorIds.size} disponible{errorIds.size > 1 ? 's' : ''}</strong></button>
        <button className="trainingPresetCard due" disabled={!dueQuestions.length} onClick={() => launchPreset('due')}><span className="presetIcon">✓</span><div><span>RÉPÉTITION ESPACÉE</span><h2>Révisions dues</h2><p>Travaille exactement les questions prévues aujourd’hui.</p></div><strong>{dueQuestions.length} due{dueQuestions.length > 1 ? 's' : ''}</strong></button>
      </section>

      {launchMessage && <div className="alert info">{launchMessage}</div>}
      {specialLabel && <div className="alert info"><b>{specialLabel}</b> · {poolCount} question{poolCount > 1 ? 's' : ''} disponible{poolCount > 1 ? 's' : ''}.</div>}

      <section className="card customTrainingCard">
        <div className="customTrainingHead"><div><span className="sectionKicker">SESSION SUR MESURE</span><h2>Composer un entraînement</h2><p>Combine plusieurs chapitres, choisis la difficulté et décide quand afficher la correction.</p></div><div className="modeSwitcher" role="group" aria-label="Type de session"><button className={sessionMode === 'practice' ? 'active' : ''} onClick={() => setSessionMode('practice')}><b>Entraînement</b><span>Correction immédiate</span></button><button className={sessionMode === 'exam' ? 'active' : ''} onClick={() => setSessionMode('exam')}><b>Mode examen</b><span>Correction à la fin</span></button></div></div>
        <div className="formGrid trainingFormGrid">
          <div className="field"><label>Matière</label><select value={subject} onChange={(event) => { setSubject(event.target.value); setTopicsSelected([]) }}><option value="">Toutes les matières</option>{subjects.map((item) => <option key={item}>{item}</option>)}</select></div>
          <div className="field topicField"><label>Chapitres / thèmes</label><TopicPicker options={topics} value={topicsSelected} disabled={!subject} onChange={setTopicsSelected} /></div>
          <div className="field"><label>Mode documentaire</label><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="">Tout mélanger</option><option value="curated">QCM validés</option><option value="case">Cas pratiques</option><option value="synthesis">QRM synthèse</option><option value="drill">Drills mémoire</option><option value="update">Actualisations 2026</option></select></div>
          <div className="field"><label>Difficulté</label><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="">Toutes</option>{[1,2,3,4].map((level) => <option key={level} value={level}>Niveau {level}</option>)}</select></div>
          <div className="field"><label>Type de question</label><select value={type} onChange={(event) => setType(event.target.value)}><option value="">QCM + QRM</option><option value="single">Réponse unique</option><option value="multiple">Réponses multiples</option></select></div>
          <div className="field"><label>Nombre de questions</label><select value={count} onChange={(event) => setCount(Number(event.target.value))}>{[10,20,30,40,60,100,150].map((amount) => <option key={amount} value={amount}>{amount}</option>)}</select></div>
        </div>
        <div className="checkGrid singleCheck"><label><input type="checkbox" checked={dueOnly} onChange={(event) => setDueOnly(event.target.checked)} /> Uniquement les questions déjà étudiées et dues aujourd’hui</label></div>
        <div className="customTrainingFooter"><div className="setupNote">{selectedLabel}{basePool.length.toLocaleString('fr-FR')} questions correspondent à la sélection. {sessionMode === 'exam' ? `Temps prévu : ${formatTime(Math.min(count, basePool.length) * 90)}.` : 'La correction sera immédiate.'}</div><button className="btn btnPrimary startCustomButton" disabled={!basePool.length} onClick={() => sessionMode === 'exam' ? startExam(basePool, count) : startPractice('', count, basePool)}>{sessionMode === 'exam' ? 'Lancer le mode examen' : 'Démarrer la série'}</button></div>
      </section>
    </>
  }

  const question = practiceSession.items[practiceSession.index]
  const isFavorite = progress.favorites.includes(question.id)
  const sourceKind = question.source?.kind === 'official' || question.mode === 'update' ? 'Officiel / actualisé' : 'Cours / corrigé'
  return <div className="quizShell">
    <div className="quizTop"><button className="btn btnSoft" onClick={() => setPracticeSession(null)}>← Quitter</button><span className="practiceModeLabel">Correction immédiate</span><div className="right">{practiceSession.index + 1}/{practiceSession.items.length}</div></div>
    <div className="progress"><i style={{ width: `${((practiceSession.index + (validated ? 1 : 0)) / practiceSession.items.length) * 100}%` }} /></div>
    <div className="card questionCard">
      <div className="meta"><span className="badge badgeBrand">{question.subject}</span><span className="badge">{question.topic}</span>{question.difficulty ? <span className="badge badgeWarn">Niveau {question.difficulty}</span> : null}<span className="badge">{modeLabel(question.mode)}</span><span className="badge">{sourceKind}</span></div>
      <h2>{question.stem}</h2><p className="questionInstruction">{question.answers.length > 1 ? 'Plusieurs réponses peuvent être exactes.' : 'Une seule réponse est attendue.'}</p>
      <div>{question.options.map((option, index) => { let className = 'option'; if (!validated && selected.includes(index)) className += ' selected'; if (validated && question.answers.includes(index)) className += ' correct'; else if (validated && selected.includes(index)) className += ' wrong'; return <button key={index} className={className} onClick={() => toggle(index)}><span className="letter">{String.fromCharCode(65 + index)}</span><span>{option}</span></button> })}</div>
      {validated && <div className={`feedback ${lastOk ? '' : 'bad'}`}><b>{lastOk ? '✓ Bonne réponse' : 'À revoir'}</b><div className="feedbackText">{question.explanation || 'Correction enregistrée.'}</div>{question.optionExplanations?.map((text, index) => text ? <div className="optionExplanation" key={index}><b>{String.fromCharCode(65 + index)}.</b> {text}</div> : null)}{question.source?.label && <div className="sourceLine">Source : {question.source.label}{question.source.url ? <> · <a href={question.source.url} target="_blank" rel="noreferrer">ouvrir</a></> : null}</div>}</div>}
      <div className="quizActions"><button className="btn btnSoft" onClick={() => toggleFavorite(question.id)}>{isFavorite ? '★ Favori' : '☆ Favori'}</button>{validated ? <button className="btn btnPrimary" onClick={next}>{practiceSession.index === practiceSession.items.length - 1 ? 'Voir le résultat' : 'Question suivante'}</button> : <button className="btn btnPrimary" disabled={!selected.length} onClick={validate}>Valider</button>}</div>
    </div>
  </div>
}
