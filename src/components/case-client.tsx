'use client'

import { useEffect, useMemo, useState } from 'react'
import { caseStat, completeCase, recordCaseStep } from '@/lib/progress'
import type { CaseQuestion, LexCase } from '@/lib/catalog'
import { useProgress } from '@/lib/use-progress'

function isCorrect(q: CaseQuestion, selected: number[]) {
  const a = [...q.answers].sort((x, y) => x - y)
  const b = [...selected].sort((x, y) => x - y)
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export function CaseClient() {
  const { progress, persist, loading: progressLoading } = useProgress()
  const [cases, setCases] = useState<LexCase[]>([])
  const [active, setActive] = useState<LexCase | null>(null)
  const [items, setItems] = useState<CaseQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number[]>([])
  const [validated, setValidated] = useState(false)
  const [score, setScore] = useState(0)
  const [startedAt, setStartedAt] = useState(0)
  const [done, setDone] = useState<{ score: number; total: number; title: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [subjectFilter, setSubjectFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [readingOnly, setReadingOnly] = useState<LexCase | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/generated/cases.json', { cache: 'no-store' })
        if (response.ok) {
          const value = await response.json()
          setCases(Array.isArray(value) ? value : [])
        }
      } finally { setLoading(false) }
    }
    void load()
  }, [])

  const subjects = useMemo(() => [...new Set(cases.map((c) => c.subject || c.topic || 'Dossiers progressifs'))].sort((a, b) => a.localeCompare(b, 'fr')), [cases])
  const providers = useMemo(() => [...new Set(cases.map((c) => c.provider || 'LexQCM'))].sort((a, b) => a.localeCompare(b, 'fr')), [cases])
  const filtered = useMemo(() => cases.filter((c) => (!subjectFilter || (c.subject || c.topic || 'Dossiers progressifs') === subjectFilter) && (!providerFilter || (c.provider || 'LexQCM') === providerFilter)), [cases, subjectFilter, providerFilter])

  function wrongIds(item: LexCase) {
    const stat = caseStat(progress, item.id)
    return new Set(item.questions.filter((q) => {
      const s = stat.steps[q.id]
      return s && s.wrong > 0 && s.wrong >= s.correct
    }).map((q) => q.id))
  }

  function start(item: LexCase, errorsOnly = false) {
    if (!item.questions?.length || item.status === 'source_only') return
    const chosen = errorsOnly ? item.questions.filter((q) => wrongIds(item).has(q.id)) : item.questions
    if (!chosen.length) return
    setActive(item); setItems(chosen); setIndex(0); setSelected([]); setValidated(false); setScore(0); setDone(null); setStartedAt(Date.now()); setOnlyErrors(errorsOnly); setReadingOnly(null)
  }

  function toggle(option: number) {
    if (!active || validated) return
    const q = items[index]
    if ((q.type ?? (q.answers.length > 1 ? 'multiple' : 'single')) === 'single') setSelected([option])
    else setSelected((current) => current.includes(option) ? current.filter((x) => x !== option) : [...current, option])
  }

  function validate() {
    if (!active || !selected.length) return
    const q = items[index]
    const ok = isCorrect(q, selected)
    const next = recordCaseStep(progress, { caseId: active.id, questionId: q.id, phase: q.phase, ok })
    persist(next)
    if (ok) setScore((x) => x + 1)
    setValidated(true)
  }

  async function finish() {
    if (!active) return
    const total = items.length
    const finalScore = score
    const rate = total ? Math.round((finalScore / total) * 100) : 0
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    if (!onlyErrors) persist(completeCase(progress, active.id, rate))
    setDone({ score: finalScore, total, title: active.title })
    try { await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: onlyErrors ? 'case-review' : 'case', subject: active.title, score: finalScore, total, durationSeconds, answers: [] }) }) } catch {}
    setActive(null)
  }

  function next() {
    if (!active) return
    if (index === items.length - 1) { void finish(); return }
    setIndex((x) => x + 1); setSelected([]); setValidated(false)
  }

  if (loading || progressLoading) return <div className="card loadingCard"><div className="spinner" /> Chargement des dossiers…</div>

  if (readingOnly) return <div className="pendingReader"><button className="btn btnGhost" onClick={() => setReadingOnly(null)}>← Tous les dossiers</button><div className="card pendingPaper"><span className="badge">Sujet importé · {readingOnly.provider || 'LexQCM'}</span><h1>{readingOnly.title}</h1><div className="meta"><span className="badge">Sans corrigé</span><span className="badge">{readingOnly.topic || 'Cas pratique'}</span></div><div className="alert warn"><b>Aucune réponse n’a été générée.</b> Le corrigé n’a pas été fourni : LexQCM conserve l’énoncé sans inventer de solution.</div><div className="scenarioText">{readingOnly.scenario}</div>{readingOnly.source?.label && <div className="sourceLine">Source : {readingOnly.source.label}</div>}</div></div>

  if (done) {
    const rate = done.total ? Math.round(done.score / done.total * 100) : 0
    return <div className="quizShell"><div className="card resultCard"><span className={`badge ${rate >= 75 ? 'badgeGood' : 'badgeWarn'}`}>{onlyErrors ? 'Révision ciblée terminée' : 'Dossier terminé'}</span><div className="resultScore">{done.score}/{done.total}</div><h2>{rate}% de réussite</h2><p className="muted">{done.title}</p><div className="actions centerActions"><button className="btn btnPrimary" onClick={() => { const item = cases.find((c) => c.title === done.title); if (item) start(item) }}>Refaire le dossier</button><button className="btn btnGhost" onClick={() => setDone(null)}>Tous les dossiers</button></div></div></div>
  }

  if (!active) {
    const readyCount = cases.filter((c) => c.status !== 'source_only').length
    const completed = cases.filter((c) => c.status !== 'source_only' && caseStat(progress, c.id).completed).length
    return <>
      <div className="top"><div><h1>Dossiers progressifs</h1><p>Le mode le plus proche des dossiers progressifs EDNi : faits persistants, qualification, règle, application et conclusion.</p></div><span className="badge badgeBrand">{completed}/{readyCount} terminés</span></div>
      <div className="alert info"><b>Méthode CRFPA :</b> le scénario reste visible pendant le dossier. Après validation, LexQCM affiche le raisonnement attendu et les références juridiques fournies avec le corrigé.</div>
      <div className="filters caseFilters"><select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}><option value="">Toutes les matières</option>{subjects.map((s) => <option key={s}>{s}</option>)}</select><select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}><option value="">Toutes les prépas</option>{providers.map((p) => <option key={p}>{p}</option>)}</select></div>
      <div className="caseGrid">{filtered.map((item) => { const cs = caseStat(progress, item.id); const wrong = wrongIds(item).size; const pending = item.status === 'source_only'; return <article key={item.id} className={`caseCard ${pending ? 'pendingCard' : ''}`}><div className="caseCardTop"><div className="meta"><span className="badge badgeBrand">{item.provider || 'LexQCM'}</span><span className="badge">{pending ? 'Sujet seul' : 'Corrigé 2026'}</span></div><span className="caseCount">{pending ? 'corrigé requis' : `${item.questions?.length || 0} étapes`}</span></div><h3>{item.title}</h3><p>{item.scenario.slice(0, 280)}{item.scenario.length > 280 ? '…' : ''}</p><div className="caseMeta"><span>{item.topic || item.subject || 'Cas pratique'}</span>{!pending && <span>Meilleur score : <b>{cs.best}%</b></span>}</div>{!pending && <div className="progress"><i style={{ width: `${cs.best}%` }} /></div>}{item.warning && <div className="caseWarning">{item.warning}</div>}<div className="caseActions">{pending ? <button className="btn btnGhost" onClick={() => setReadingOnly(item)}>Lire le sujet importé</button> : <><button className="btn btnPrimary" onClick={() => start(item)}>{cs.completed ? 'Refaire le dossier' : 'Commencer'}</button>{wrong ? <button className="btn btnSoft" onClick={() => start(item, true)}>{wrong} erreur{wrong > 1 ? 's' : ''}</button> : null}</>}</div>{item.source?.label && <div className="sourceLine">Source : {item.source.label}{item.source.pages ? ` — ${item.source.pages}` : ''}</div>}</article> })}</div>
    </>
  }

  const q = items[index]
  const ok = validated ? isCorrect(q, selected) : false
  return <div className="caseRun"><div className="caseRunHead"><button className="btn btnGhost" onClick={() => setActive(null)}>← Dossiers</button><div><b>{active.title}</b><span>{onlyErrors ? 'Reprise ciblée des erreurs' : 'Dossier complet'} · étape {index + 1}/{items.length}</span></div>{q.phase ? <span className="badge badgeBrand">{q.phase}</span> : null}</div><div className="progress"><i style={{ width: `${((index + (validated ? 1 : 0)) / items.length) * 100}%` }} /></div><div className="caseLayout"><aside className="card scenarioCard"><div className="scenarioSticky"><div className="meta"><span className="badge">{active.provider || 'LexQCM'}</span><span className="badge">CRFPA {active.year || 2026}</span></div><h2>Énoncé</h2><p>{active.scenario}</p>{active.warning && <div className="alert warn"><b>Note source :</b> {active.warning}</div>}{active.source?.label && <div className="sourceLine">Source pédagogique : {active.source.label}</div>}</div></aside><section className="card questionCard caseQuestion"><div className="meta">{q.phase && <span className="badge badgeBrand">{q.phase}</span>}<span className="badge">{active.topic || 'Cas pratique'}</span>{q.verified ? <span className="badge badgeGood">✓ Vérifié officiel</span> : null}</div><h2>{q.stem}</h2><p className="questionInstruction">{q.answers.length > 1 ? 'Plusieurs réponses peuvent être exactes.' : 'Une seule réponse est attendue.'}</p>{q.options.map((option, optionIndex) => { let cls = 'option'; if (!validated && selected.includes(optionIndex)) cls += ' selected'; if (validated && q.answers.includes(optionIndex)) cls += ' correct'; else if (validated && selected.includes(optionIndex)) cls += ' wrong'; return <button key={optionIndex} className={cls} onClick={() => toggle(optionIndex)}><span className="letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option}</span></button> })}{validated && <div className={`feedback ${ok ? '' : 'bad'}`}><b>{ok ? '✓ Bonne analyse' : 'À reprendre'}</b><p>{q.explanation || 'Correction enregistrée.'}</p>{q.reasoning && <div className="reasoningBox"><b>Raisonnement attendu</b><p>{q.reasoning}</p></div>}{q.legalRefs?.length ? <div className="lawRefs">{q.legalRefs.map((ref) => <span className="lawRef" key={ref}>{ref}</span>)}</div> : null}{q.verified?.label && <div className="verifiedNote">✓ {q.verified.label}{q.verified.url ? <> · <a href={q.verified.url} target="_blank" rel="noreferrer">ouvrir la source officielle</a></> : null}</div>}</div>}<div className="quizActions"><span className="muted">Réponds avant d’afficher le raisonnement.</span>{validated ? <button className="btn btnPrimary" onClick={next}>{index === items.length - 1 ? 'Bilan du dossier' : 'Étape suivante'}</button> : <button className="btn btnPrimary" disabled={!selected.length} onClick={validate}>Valider</button>}</div></section></div></div>
}
