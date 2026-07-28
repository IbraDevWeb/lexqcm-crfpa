'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { modeLabel, type LexQuestion } from '@/lib/catalog'
import { recordAnswer, type ProgressState } from '@/lib/progress'

export type ExamResult = {
  score: number
  total: number
  unanswered: number
  duration: number
  rows: {
    question: LexQuestion
    selected: number[]
    ok: boolean
    unanswered: boolean
  }[]
}

function sameAnswer(question: LexQuestion, selected: number[]) {
  const expected = [...question.answers].sort((a, b) => a - b)
  const actual = [...selected].sort((a, b) => a - b)
  return expected.length === actual.length && expected.every((value, index) => value === actual[index])
}

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = seconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}

function optionLetters(question: LexQuestion, indexes: number[]) {
  if (!indexes.length) return 'Aucune réponse'
  return indexes.map((index) => `${String.fromCharCode(65 + index)}. ${question.options[index] ?? ''}`).join(' · ')
}

export function ExamSession({
  questions,
  progress,
  persist,
  onExit,
}: {
  questions: LexQuestion[]
  progress: ProgressState
  persist: (next: ProgressState) => void
  onExit: () => void
}) {
  const totalDuration = Math.max(questions.length * 90, 60)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number[]>>({})
  const [flagged, setFlagged] = useState<string[]>([])
  const [secondsLeft, setSecondsLeft] = useState(totalDuration)
  const [startedAt] = useState(Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ExamResult | null>(null)
  const [navigatorOpen, setNavigatorOpen] = useState(false)
  const [reviewFilter, setReviewFilter] = useState<'all' | 'wrong' | 'unanswered'>('wrong')

  const question = questions[index]
  const selected = answers[question?.id] ?? []
  const answeredCount = useMemo(() => questions.filter((item) => (answers[item.id]?.length ?? 0) > 0).length, [answers, questions])
  const unansweredCount = questions.length - answeredCount

  useEffect(() => {
    if (result || submitting) return
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [result, submitting])

  useEffect(() => {
    if (secondsLeft === 0 && !result && !submitting) void submitExam(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, result, submitting])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (result) return
      if (event.key === 'ArrowLeft') setIndex((current) => Math.max(0, current - 1))
      if (event.key === 'ArrowRight') setIndex((current) => Math.min(questions.length - 1, current + 1))
      if (/^[1-6]$/.test(event.key)) {
        const optionIndex = Number(event.key) - 1
        if (question?.options[optionIndex]) toggleOption(optionIndex)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function toggleOption(optionIndex: number) {
    if (!question || submitting) return
    const multiple = (question.type ?? (question.answers.length > 1 ? 'multiple' : 'single')) === 'multiple'
    setAnswers((current) => {
      const existing = current[question.id] ?? []
      const next = multiple
        ? existing.includes(optionIndex)
          ? existing.filter((item) => item !== optionIndex)
          : [...existing, optionIndex]
        : [optionIndex]
      return { ...current, [question.id]: next }
    })
  }

  function toggleFlag() {
    if (!question) return
    setFlagged((current) => current.includes(question.id) ? current.filter((id) => id !== question.id) : [...current, question.id])
  }

  async function submitExam(automatic = false) {
    if (submitting || result) return
    if (!automatic && unansweredCount > 0) {
      const confirmed = window.confirm(`Il reste ${unansweredCount} question${unansweredCount > 1 ? 's' : ''} sans réponse. Souhaites-tu vraiment terminer l’examen ?`)
      if (!confirmed) return
    }

    setSubmitting(true)
    const rows = questions.map((item) => {
      const chosen = answers[item.id] ?? []
      return { question: item, selected: chosen, ok: sameAnswer(item, chosen), unanswered: chosen.length === 0 }
    })
    const score = rows.filter((row) => row.ok).length
    const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000))

    let nextProgress = progress
    rows.forEach((row) => {
      nextProgress = recordAnswer(nextProgress, row.question, row.ok)
    })
    persist(nextProgress)

    try {
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'crfpa-exam',
          subject: 'Examen blanc CRFPA',
          score,
          total: questions.length,
          durationSeconds: duration,
          answers: rows.map((row) => ({ id: row.question.id, selected: row.selected, ok: row.ok, unanswered: row.unanswered })),
        }),
      })
    } catch {}

    setResult({ score, total: questions.length, unanswered: rows.filter((row) => row.unanswered).length, duration, rows })
    setSubmitting(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (result) {
    const rate = result.total ? Math.round((result.score / result.total) * 100) : 0
    const bySubject = new Map<string, { total: number; correct: number; unanswered: number }>()
    result.rows.forEach((row) => {
      const current = bySubject.get(row.question.subject) ?? { total: 0, correct: 0, unanswered: 0 }
      current.total += 1
      if (row.ok) current.correct += 1
      if (row.unanswered) current.unanswered += 1
      bySubject.set(row.question.subject, current)
    })
    const filteredRows = result.rows.filter((row) => reviewFilter === 'all' || (reviewFilter === 'wrong' && !row.ok) || (reviewFilter === 'unanswered' && row.unanswered))

    return <div className="examResultShell">
      <section className="examResultHero">
        <div><span className="badge">Bilan d’examen CRFPA</span><h1>{rate}%</h1><p>{result.score} bonne{result.score > 1 ? 's' : ''} réponse{result.score > 1 ? 's' : ''} sur {result.total}. La correction et la répétition espacée ont été mises à jour en une seule fois.</p></div>
        <div className="examResultActions"><button className="btn btnSoft" onClick={onExit}>Nouvelle session</button><Link className="btn btnGhost" href="/errors">Réviser mes erreurs</Link></div>
      </section>

      <div className="examSummaryGrid">
        <article className="card examSummaryCard"><span>Score</span><b>{result.score}/{result.total}</b><small>{rate}% de réussite</small></article>
        <article className="card examSummaryCard"><span>Temps utilisé</span><b>{formatTime(result.duration)}</b><small>sur {formatTime(totalDuration)}</small></article>
        <article className="card examSummaryCard"><span>Sans réponse</span><b>{result.unanswered}</b><small>questions laissées vides</small></article>
        <article className="card examSummaryCard"><span>À retravailler</span><b>{result.total - result.score}</b><small>ajoutées au suivi adaptatif</small></article>
      </div>

      <section className="card examBreakdown"><div className="sectionHead"><div><h2>Résultats par matière</h2><p className="muted">Repère immédiatement les blocs les moins maîtrisés.</p></div></div><div className="examSubjectGrid">{[...bySubject.entries()].sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total)).map(([subject, stat]) => { const subjectRate = Math.round((stat.correct / stat.total) * 100); return <article key={subject}><div><b>{subject}</b><strong>{subjectRate}%</strong></div><div className="progress"><i style={{ width: `${subjectRate}%` }} /></div><small>{stat.correct}/{stat.total} correctes{stat.unanswered ? ` · ${stat.unanswered} vide${stat.unanswered > 1 ? 's' : ''}` : ''}</small></article> })}</div></section>

      <section className="examReviewSection">
        <div className="examReviewHead"><div><h2>Correction détaillée</h2><p>Les explications restent fondées sur la banque LexQCM et ses sources.</p></div><div className="examReviewFilters"><button className={reviewFilter === 'wrong' ? 'active' : ''} onClick={() => setReviewFilter('wrong')}>Erreurs</button><button className={reviewFilter === 'unanswered' ? 'active' : ''} onClick={() => setReviewFilter('unanswered')}>Sans réponse</button><button className={reviewFilter === 'all' ? 'active' : ''} onClick={() => setReviewFilter('all')}>Toutes</button></div></div>
        <div className="examReviewList">{filteredRows.map((row, rowIndex) => <article className={`card examReviewCard ${row.ok ? 'isCorrect' : 'isWrong'}`} key={row.question.id}><div className="examReviewMeta"><span className="badge badgeBrand">{row.question.subject}</span><span className="badge">{row.question.topic}</span><span className={`badge ${row.ok ? 'badgeGood' : row.unanswered ? 'badgeWarn' : 'badgeBad'}`}>{row.ok ? 'Correcte' : row.unanswered ? 'Sans réponse' : 'Incorrecte'}</span></div><h3>{rowIndex + 1}. {row.question.stem}</h3><div className="examAnswerCompare"><div><span>Ta réponse</span><b>{optionLetters(row.question, row.selected)}</b></div><div><span>Réponse attendue</span><b>{optionLetters(row.question, row.question.answers)}</b></div></div>{row.question.explanation && <p className="examExplanation">{row.question.explanation}</p>}{row.question.source?.label && <div className="sourceLine">Source : {row.question.source.label}{row.question.source.url ? <> · <a href={row.question.source.url} target="_blank" rel="noreferrer">ouvrir</a></> : null}</div>}</article>)}</div>
      </section>
    </div>
  }

  return <div className="examShell">
    <header className="examTopbar">
      <div><span className="examEyebrow">Examen blanc CRFPA</span><b>Question {index + 1} sur {questions.length}</b></div>
      <div className="examTopStats"><span>{answeredCount}/{questions.length} répondues</span><strong className={secondsLeft < 600 ? 'urgent' : ''}>⏱ {formatTime(secondsLeft)}</strong></div>
      <button className="btn btnGhost examNavigatorToggle" onClick={() => setNavigatorOpen((current) => !current)}>Grille des questions</button>
    </header>
    <div className="progress examProgress"><i style={{ width: `${(answeredCount / questions.length) * 100}%` }} /></div>

    <div className="examLayout">
      <section className="card questionCard examQuestionCard">
        <div className="meta"><span className="badge badgeBrand">{question.subject}</span><span className="badge">{question.topic}</span>{question.difficulty ? <span className="badge badgeWarn">Niveau {question.difficulty}</span> : null}<span className="badge">{modeLabel(question.mode)}</span></div>
        <h2>{question.stem}</h2><p className="questionInstruction">{question.answers.length > 1 ? 'Plusieurs réponses peuvent être exactes.' : 'Une seule réponse est attendue.'} La correction sera affichée uniquement à la fin.</p>
        <div>{question.options.map((option, optionIndex) => <button key={optionIndex} className={`option ${selected.includes(optionIndex) ? 'selected' : ''}`} onClick={() => toggleOption(optionIndex)}><span className="letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option}</span></button>)}</div>
        <div className="examQuestionActions"><button className={`btn ${flagged.includes(question.id) ? 'btnSoft' : 'btnGhost'}`} onClick={toggleFlag}>{flagged.includes(question.id) ? '★ À revoir' : '☆ Marquer à revoir'}</button><div><button className="btn btnGhost" disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>← Précédente</button><button className="btn btnPrimary" disabled={index === questions.length - 1} onClick={() => setIndex((current) => Math.min(questions.length - 1, current + 1))}>Suivante →</button></div></div>
      </section>

      <aside className={`card examNavigator ${navigatorOpen ? 'open' : ''}`}>
        <div className="examNavigatorHead"><div><h3>Navigation</h3><p>{answeredCount} répondue{answeredCount > 1 ? 's' : ''} · {flagged.length} marquée{flagged.length > 1 ? 's' : ''}</p></div><button onClick={() => setNavigatorOpen(false)} aria-label="Fermer">×</button></div>
        <div className="examQuestionGrid">{questions.map((item, itemIndex) => { const answered = (answers[item.id]?.length ?? 0) > 0; const marked = flagged.includes(item.id); return <button key={item.id} className={`${itemIndex === index ? 'current' : ''} ${answered ? 'answered' : ''} ${marked ? 'flagged' : ''}`} onClick={() => { setIndex(itemIndex); setNavigatorOpen(false) }} aria-label={`Question ${itemIndex + 1}${answered ? ', répondue' : ''}${marked ? ', à revoir' : ''}`}>{itemIndex + 1}</button> })}</div>
        <div className="examLegend"><span><i className="answered" />Répondue</span><span><i className="flagged" />À revoir</span><span><i />Sans réponse</span></div>
        <button className="btn btnDanger examSubmit" disabled={submitting} onClick={() => void submitExam(false)}>{submitting ? 'Enregistrement…' : 'Terminer et corriger'}</button>
        <button className="examQuit" onClick={() => { if (window.confirm('Quitter cet examen ? Les réponses non validées seront perdues.')) onExit() }}>Quitter l’examen</button>
      </aside>
    </div>
  </div>
}
