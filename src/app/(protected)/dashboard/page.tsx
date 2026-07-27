import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { emptyProgress, normalizeProgress } from '@/lib/progress'

export const metadata = { title: 'Tableau de bord' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: progressRow }, { data: sessions }] = await Promise.all([
    supabase.from('user_progress').select('progress').eq('user_id', user!.id).maybeSingle(),
    supabase.from('study_sessions').select('id,mode,subject,score,total,created_at').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(6),
  ])

  const progress = progressRow?.progress ? normalizeProgress(progressRow.progress) : emptyProgress()
  const rate = progress.answered ? Math.round((progress.correct / progress.answered) * 100) : 0
  const due = Object.values(progress.questionStats).filter((s) => (s.due || '') <= new Date().toISOString().slice(0, 10)).length
  const fragile = Object.values(progress.questionStats).filter((s) => s.wrong > 0 && (s.correct === 0 || s.wrong >= s.correct)).length
  const subjects = new Map<string, { total: number; correct: number }>()
  progress.history.forEach((item) => {
    const current = subjects.get(item.subject) ?? { total: 0, correct: 0 }
    current.total += 1
    if (item.ok) current.correct += 1
    subjects.set(item.subject, current)
  })

  return <>
    <div className="top"><div><h1>Tableau de bord</h1><p>Ta progression est liée à ton compte et se retrouve sur ordinateur, téléphone et tablette.</p></div><span className="badge badgeBrand">{progress.streak} jour{progress.streak === 1 ? '' : 's'} de série</span></div>
    <div className="grid">
      <section className="card hero"><div><span className="badge">LexQCM Cloud · CRFPA 2026</span><h2>Reprends exactement là où tu t’es arrêté.</h2><p>QCM, répétition espacée, favoris et historique sont synchronisés avec ton compte Supabase. Hors ligne, la progression reste en local puis se resynchronise.</p></div><div className="actions"><Link className="btn btnSoft" href="/train">Commencer une série</Link><Link className="btn btnGhost" href="/account">Mon compte</Link></div></section>
      <div className="card stat"><div className="statLabel">Réussite</div><div className="statValue">{rate}%</div><div className="muted">{progress.correct}/{progress.answered}</div></div>
      <div className="card stat"><div className="statLabel">À revoir</div><div className="statValue">{fragile}</div><div className="muted">notions fragiles</div></div>
      <div className="card stat"><div className="statLabel">Dues</div><div className="statValue">{due}</div><div className="muted">révisions</div></div>
      <div className="card stat"><div className="statLabel">Favoris</div><div className="statValue">{progress.favorites.length}</div><div className="muted">questions</div></div>
      <section className="card wide"><h2 style={{ marginTop: 0 }}>Matières travaillées</h2>{subjects.size ? <div className="subjectGrid">{[...subjects.entries()].map(([subject, stat]) => { const pct = stat.total ? Math.round(stat.correct / stat.total * 100) : 0; return <div className="subjectCard" key={subject}><b>{subject}</b><div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{stat.total} réponse{stat.total > 1 ? 's' : ''} · {pct}%</div><div className="progress"><i style={{ width: `${pct}%` }} /></div></div> })}</div> : <p className="muted">Lance ta première série pour commencer à remplir tes statistiques.</p>}</section>
      <section className="card side"><h2 style={{ marginTop: 0 }}>Dernières sessions</h2>{sessions?.length ? sessions.map((s) => <div className="row" key={s.id}><div><b>{s.subject || 'Toutes matières'}</b><div className="muted" style={{ fontSize: 11 }}>{new Date(s.created_at).toLocaleDateString('fr-FR')}</div></div><b>{s.score}/{s.total}</b></div>) : <p className="muted">Aucune session enregistrée.</p>}</section>
    </div>
  </>
}
