'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { isDue, questionStat } from '@/lib/progress'
import { isOfficialUpdate, modeLabel, type LexCase, type LexQuestion } from '@/lib/catalog'
import { useProgress } from '@/lib/use-progress'

type View = 'errors' | 'stats' | 'bank' | 'updates' | 'quality'

type QualityReport = {
  generatedAt?: string
  inputCount: number
  keptCount: number
  excludedCount: number
  excludedRate: number
  categories: { id: string; label: string; count: number; samples?: { id: string; subject: string; topic: string; stem: string }[] }[]
  subjects: { subject: string; count: number }[]
  policy?: { excluded?: string[]; preserved?: string[] }
}

function pct(a: number, b: number) { return b ? Math.round((a / b) * 100) : 0 }
function formatDate(value?: string | null) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR') : '—' }

export function LibraryPageClient({ view }: { view: View }) {
  const [questions, setQuestions] = useState<LexQuestion[]>([])
  const [cases, setCases] = useState<LexCase[]>([])
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null)
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const { progress, loading: loadingProgress, syncing, online } = useProgress()

  useEffect(() => {
    const load = async () => {
      try {
        const [q, c, quality] = await Promise.all([
          fetch('/generated/questions.json', { cache: 'no-store' }),
          fetch('/generated/cases.json', { cache: 'no-store' }),
          fetch('/generated/quality-report.json', { cache: 'no-store' }),
        ])
        if (!q.ok || !c.ok) throw new Error('Impossible de charger la banque LexQCM.')
        const [qv, cv] = await Promise.all([q.json(), c.json()])
        setQuestions(Array.isArray(qv) ? qv : [])
        setCases(Array.isArray(cv) ? cv : [])
        if (quality.ok) setQualityReport(await quality.json())
      } catch (error) {
        setCatalogError(error instanceof Error ? error.message : 'Banque indisponible.')
      } finally {
        setLoadingCatalog(false)
      }
    }
    void load()
  }, [])

  if (loadingCatalog || loadingProgress) return <div className="card loadingCard"><div className="spinner" /> Chargement de LexQCM…</div>
  if (catalogError) return <div className="error">{catalogError}</div>

  const syncBadge = <span className="badge"><span className="offlineDot" style={{ background: online ? '#059669' : '#d97706' }} />{online ? (syncing ? 'Synchronisation…' : 'Cloud synchronisé') : 'Hors connexion'}</span>

  if (view === 'errors') {
    const errorItems = questions.filter((q) => {
      const s = questionStat(progress, q.id)
      return s.wrong > 0 && (s.correct === 0 || s.wrong >= s.correct)
    })
    return <>
      <div className="top"><div><h1>Mes erreurs</h1><p>Les questions fragiles reviennent automatiquement plus tôt dans la répétition espacée.</p></div>{syncBadge}</div>
      <div className="sectionActions"><div><b>{errorItems.length}</b> question{errorItems.length > 1 ? 's' : ''} à retravailler</div>{errorItems.length ? <Link className="btn btnPrimary" href="/train?mode=errors">Rejouer mes erreurs</Link> : null}</div>
      <div className="card">
        {errorItems.length ? <div className="tableWrap"><table className="table"><thead><tr><th>Matière</th><th>Thème</th><th>Question</th><th>Erreurs</th><th>Réussites</th><th>Prochaine révision</th></tr></thead><tbody>{errorItems.slice(0, 500).map((q) => { const s = questionStat(progress, q.id); return <tr key={q.id}><td>{q.subject}</td><td>{q.topic}</td><td className="qPreview">{q.stem}</td><td><span className="badge badgeBad">{s.wrong}</span></td><td>{s.correct}</td><td>{formatDate(s.due)}</td></tr> })}</tbody></table></div> : <div className="emptyState"><b>Aucune erreur active.</b><span>Commence une série pour alimenter ton carnet d’erreurs.</span><Link className="btn btnPrimary" href="/train">S’entraîner</Link></div>}
      </div>
    </>
  }

  if (view === 'stats') {
    const subjects = [...new Set(questions.map((q) => q.subject))]
    const cards = subjects.map((subject) => {
      const history = progress.history.filter((h) => h.subject === subject)
      const correct = history.filter((h) => h.ok).length
      const seen = new Set(history.map((h) => h.id)).size
      const total = questions.filter((q) => q.subject === subject).length
      return { subject, answers: history.length, correct, seen, total, rate: pct(correct, history.length) }
    })
    const completedCases = Object.values(progress.caseStats).filter((s) => s.completed).length
    const due = questions.filter((q) => Boolean(progress.questionStats[q.id]?.seen) && isDue(progress, q.id)).length
    return <>
      <div className="top"><div><h1>Statistiques</h1><p>Une vue complète de ta progression, désormais synchronisée avec ton compte.</p></div>{syncBadge}</div>
      <div className="statsGrid">
        <div className="card statBig"><span>Réussite globale</span><b>{pct(progress.correct, progress.answered)}%</b><small>{progress.correct}/{progress.answered} réponses correctes</small></div>
        <div className="card statBig"><span>Révisions dues</span><b>{due}</b><small>questions déjà étudiées à revoir</small></div>
        <div className="card statBig"><span>Dossiers terminés</span><b>{completedCases}/{cases.filter((c) => c.status !== 'source_only').length}</b><small>{progress.caseHistory.length} étapes répondues</small></div>
        <div className="card statBig"><span>Série</span><b>{progress.streak}</b><small>jour{progress.streak > 1 ? 's' : ''}</small></div>
      </div>
      <div className="subjectStatsGrid">{cards.map((s) => <article className="card subjectStatCard" key={s.subject}><div className="sectionHead"><h2>{s.subject}</h2><strong>{s.rate}%</strong></div><div className="progress"><i style={{ width: `${s.rate}%` }} /></div><div className="row"><span>Réponses</span><b>{s.answers}</b></div><div className="row"><span>Questions vues</span><b>{s.seen}/{s.total}</b></div><div className="row"><span>Bonnes réponses</span><b>{s.correct}</b></div></article>)}</div>
    </>
  }

  if (view === 'bank') return <BankView questions={questions} />

  if (view === 'updates') {
    const updates = questions.filter(isOfficialUpdate)
    return <>
      <div className="top"><div><h1>Actualisations 2026</h1><p>Les règles revérifiées ou isolées comme postérieures aux fascicules 2025.</p></div><Link className="btn btnPrimary" href="/train?mode=update">S’entraîner sur les mises à jour</Link></div>
      <div className="alert warn"><b>Principe de prudence :</b> cette section reste séparée de la banque issue des cours afin de distinguer clairement le contenu pédagogique 2025 et les règles actualisées.</div>
      <div className="updatesGrid">{updates.map((q) => <article className="card updateCard" key={q.id}><div className="meta"><span className="badge badgeGood">Vérifié / actualisé</span><span className="badge">{q.subject}</span></div><h3>{q.topic}</h3><p>{q.stem}</p><div className="sourceLine">{q.source?.label || 'Source officielle'}{q.source?.url ? <> · <a href={q.source.url} target="_blank" rel="noreferrer">ouvrir la source</a></> : null}</div></article>)}</div>
      {!updates.length && <div className="card emptyState"><b>Aucune actualisation détectée.</b></div>}
    </>
  }

  const ready = cases.filter((c) => c.status !== 'source_only')
  const pending = cases.filter((c) => c.status === 'source_only')
  const qrm = questions.filter((q) => q.type === 'multiple' || q.answers.length > 1).length
  const caseSteps = ready.reduce((sum, c) => sum + (c.questions?.length || 0), 0)
  const sourceCount = qualityReport?.inputCount ?? questions.length
  const reviewCount = qualityReport?.excludedCount ?? 0

  return <>
    <div className="top"><div><h1>Qualité & sources</h1><p>La banque publiée privilégie l’application juridique plutôt que le repérage mécanique dans les fascicules.</p></div><span className="badge badgeGood">Filtre éditorial actif</span></div>
    <div className="alert successBox"><b>Qualité avant quantité :</b> {questions.length.toLocaleString('fr-FR')} questions utiles sont actives. {reviewCount.toLocaleString('fr-FR')} questions de repérage documentaire ont été retirées de l’entraînement et conservées séparément pour réécriture, sans suppression de la source d’origine.</div>
    <div className="qualityGrid">
      <div className="qualityItem"><b>{questions.length.toLocaleString('fr-FR')}</b><span>questions utiles actives</span></div>
      <div className="qualityItem"><b>{reviewCount.toLocaleString('fr-FR')}</b><span>questions en revue éditoriale</span></div>
      <div className="qualityItem"><b>{sourceCount.toLocaleString('fr-FR')}</b><span>questions dans la banque source</span></div>
      <div className="qualityItem"><b>{qrm}</b><span>QRM actifs</span></div>
      <div className="qualityItem"><b>{ready.length}</b><span>dossiers corrigés</span></div>
      <div className="qualityItem"><b>{caseSteps}</b><span>étapes contextuelles</span></div>
    </div>
    {qualityReport && <div className="qualityEditorialGrid">
      <section className="card qualityDetail"><div className="sectionHead"><div><span className="sectionKicker">AUDIT AUTOMATISÉ</span><h2>Questions retirées</h2></div><span className="badge badgeWarn">{qualityReport.excludedRate}% de la source</span></div>{qualityReport.categories.map((category) => <div className="row" key={category.id}><span>{category.label}</span><b>{category.count}</b></div>)}</section>
      <section className="card qualityDetail"><div className="sectionHead"><div><span className="sectionKicker">RÉPARTITION</span><h2>Matières à réécrire</h2></div></div>{qualityReport.subjects.map((subject) => <div className="row" key={subject.subject}><span>{subject.subject}</span><b>{subject.count}</b></div>)}</section>
    </div>}
    <section className="card qualityDetail"><h2>Politique éditoriale</h2><div className="row"><span>Numéro d’article, page ou emplacement à retrouver</span><b>Retiré de l’entraînement</b></div><div className="row"><span>Mot ou formulation exacte à réciter</span><b>Retiré de l’entraînement</b></div><div className="row"><span>Condition, effet, sanction ou distinction de régime</span><b>Conservé</b></div><div className="row"><span>Délai ou seuil produisant une conséquence juridique</span><b>Conservé</b></div><div className="row"><span>Qualification ou application à des faits</span><b>Prioritaire</b></div><div className="row"><span>Sujets sans corrigé</span><b>{pending.length} · aucune solution inventée</b></div></section>
  </>
}

function BankView({ questions }: { questions: LexQuestion[] }) {
  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState('')
  const [mode, setMode] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 40
  const subjects = useMemo(() => [...new Set(questions.map((q) => q.subject))].sort((a, b) => a.localeCompare(b, 'fr')), [questions])
  const filtered = useMemo(() => questions.filter((q) => {
    const needle = search.trim().toLowerCase()
    return (!subject || q.subject === subject) && (!mode || q.mode === mode) && (!type || (q.type ?? (q.answers.length > 1 ? 'multiple' : 'single')) === type) && (!needle || `${q.stem} ${q.topic} ${q.subject}`.toLowerCase().includes(needle))
  }), [questions, search, subject, mode, type])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, pages)
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize)
  const update = (fn: () => void) => { fn(); setPage(1) }
  return <>
    <div className="top"><div><h1>Banque QCM</h1><p>{questions.length.toLocaleString('fr-FR')} questions utiles, après retrait des exercices de simple repérage documentaire.</p></div><Link className="btn btnPrimary" href="/train">Créer une série</Link></div>
    <div className="card">
      <div className="filters"><input value={search} onChange={(e) => update(() => setSearch(e.target.value))} placeholder="Rechercher dans les questions…" /><select value={subject} onChange={(e) => update(() => setSubject(e.target.value))}><option value="">Toutes les matières</option>{subjects.map((s) => <option key={s}>{s}</option>)}</select><select value={mode} onChange={(e) => update(() => setMode(e.target.value))}><option value="">Tous les modes</option><option value="curated">QCM validés</option><option value="case">Cas pratiques</option><option value="synthesis">QRM synthèse</option><option value="drill">Drills mémoire</option><option value="update">Actualisations 2026</option></select><select value={type} onChange={(e) => update(() => setType(e.target.value))}><option value="">QCM + QRM</option><option value="single">Réponse unique</option><option value="multiple">Multi-réponses</option></select></div>
      <div className="bankCount">{filtered.length.toLocaleString('fr-FR')} résultat{filtered.length > 1 ? 's' : ''}</div>
      <div className="tableWrap"><table className="table"><thead><tr><th>Matière</th><th>Mode</th><th>Thème</th><th>Question</th><th>Source</th></tr></thead><tbody>{rows.map((q) => <tr key={q.id}><td>{q.subject}</td><td>{modeLabel(q.mode)}</td><td>{q.topic}</td><td className="qPreview">{q.stem}</td><td className="sourceCell">{q.source?.label || '—'}</td></tr>)}</tbody></table></div>
      <div className="pagination"><button className="btn btnGhost" disabled={current <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Précédent</button><span>Page {current}/{pages}</span><button className="btn btnGhost" disabled={current >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Suivant →</button></div>
    </div>
  </>
}
