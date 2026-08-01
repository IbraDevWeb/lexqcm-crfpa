'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

export type DashboardData = {
  rate: number
  answered: number
  correct: number
  due: number
  fragile: number
  favorites: number
  streak: number
  today: {
    answers: number
    sessions: number
    minutes: number
  }
  activity: { date: string; count: number; label: string }[]
  subjects: {
    subject: string
    attempts: number
    correct: number
    uniqueSeen: number
    totalQuestions: number
    rate: number
    coverage: number
  }[]
  weakest: {
    subject: string
    attempts: number
    rate: number
    coverage: number
  }[]
  chapters: {
    subject: string
    topic: string
    attempts: number
    uniqueSeen: number
    totalQuestions: number
    rate: number
    coverage: number
  }[]
  sessions: {
    id: string
    mode: string
    subject: string | null
    score: number
    total: number
    createdAt: string
    durationSeconds: number
  }[]
}

const GOAL_KEY = 'lexqcm_daily_question_goal_v1'

function formatDuration(seconds: number) {
  if (!seconds) return '—'
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60 || ''}`.trim() : `${minutes} min`
}

function activityLevel(count: number, max: number) {
  if (!count) return 0
  const ratio = count / Math.max(1, max)
  if (ratio <= .25) return 1
  if (ratio <= .5) return 2
  if (ratio <= .75) return 3
  return 4
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const [questionGoal, setQuestionGoal] = useState(20)

  useEffect(() => {
    const stored = Number(localStorage.getItem(GOAL_KEY))
    if (Number.isFinite(stored) && stored >= 5 && stored <= 200) setQuestionGoal(stored)
  }, [])

  function updateGoal(next: number) {
    const safe = Math.max(5, Math.min(200, next))
    setQuestionGoal(safe)
    localStorage.setItem(GOAL_KEY, String(safe))
  }

  const questionGoalRate = Math.min(100, Math.round((data.today.answers / questionGoal) * 100))
  const sessionGoalRate = Math.min(100, data.today.sessions * 100)
  const minuteGoalRate = Math.min(100, Math.round((data.today.minutes / 30) * 100))
  const maxActivity = useMemo(() => Math.max(1, ...data.activity.map((day) => day.count)), [data.activity])
  const completedGoals = [questionGoalRate, sessionGoalRate, minuteGoalRate].filter((value) => value >= 100).length

  return <>
    <div className="top dashboardTop"><div><span className="pageKicker">ESPACE PERSONNEL · CRFPA 2026</span><h1>Tableau de bord</h1><p>Ton plan de travail, tes priorités et ta progression réelle, synchronisés sur tous tes appareils.</p></div><div className="dashboardStatus"><span className="badge badgeBrand">{data.streak} jour{data.streak === 1 ? '' : 's'} de série</span><span className="badge badgeGood">Progression cloud</span></div></div>

    <section className="dashboardHeroPro">
      <div className="dashboardHeroCopy"><span className="badge">Plan du jour</span><h2>{completedGoals === 3 ? 'Objectifs atteints. Consolide maintenant.' : 'Construis une avance régulière, pas une révision de dernière minute.'}</h2><p>{data.today.answers} question{data.today.answers > 1 ? 's' : ''} aujourd’hui, {data.today.sessions} session{data.today.sessions > 1 ? 's' : ''} et {data.today.minutes} minute{data.today.minutes > 1 ? 's' : ''} de travail enregistré.</p><div className="dashboardHeroActions"><Link className="btn btnHeroPrimary" href="/train?preset=quick">Lancer une série rapide</Link><Link className="btn btnHeroGhost" href="/train?preset=exam">Examen blanc CRFPA</Link></div></div>
      <div className="goalRing" style={{ background: `conic-gradient(#ffffff ${questionGoalRate * 3.6}deg, rgba(255,255,255,.17) 0deg)` }}><div><b>{questionGoalRate}%</b><span>objectif QCM</span></div></div>
    </section>

    <section className="quickLaunchGrid" aria-label="Raccourcis d'entraînement">
      <Link href="/train?preset=quick" className="quickLaunchCard violet"><span className="quickLaunchIcon">⚡</span><div><b>Série rapide</b><p>10 questions mélangées, correction immédiate.</p></div><strong>10 QCM</strong></Link>
      <Link href="/train?preset=exam" className="quickLaunchCard navy"><span className="quickLaunchIcon">◷</span><div><b>Examen blanc</b><p>Session longue, navigation libre, correction finale.</p></div><strong>100 QCM</strong></Link>
      <Link href="/train?mode=errors" className="quickLaunchCard rose"><span className="quickLaunchIcon">↻</span><div><b>Réviser mes erreurs</b><p>Reprends les notions qui résistent encore.</p></div><strong>{data.fragile}</strong></Link>
      <Link href="/train?mode=due" className="quickLaunchCard cyan"><span className="quickLaunchIcon">✓</span><div><b>Révisions dues</b><p>Respecte ton calendrier de répétition espacée.</p></div><strong>{data.due}</strong></Link>
    </section>

    <div className="dashboardMetricGrid">
      <article className="metricCard"><span>Réussite globale</span><b>{data.rate}%</b><small>{data.correct}/{data.answered} réponses correctes</small></article>
      <article className="metricCard"><span>Notions fragiles</span><b>{data.fragile}</b><small>à consolider en priorité</small></article>
      <article className="metricCard"><span>Révisions dues</span><b>{data.due}</b><small>selon la répétition espacée</small></article>
      <article className="metricCard"><span>Favoris</span><b>{data.favorites}</b><small>questions mises de côté</small></article>
    </div>

    <div className="dashboardMainGrid">
      <section className="card dailyGoalsCard">
        <div className="sectionHead"><div><span className="sectionKicker">RÉGULARITÉ</span><h2>Objectifs quotidiens</h2></div><div className="goalAdjuster"><button onClick={() => updateGoal(questionGoal - 5)} aria-label="Réduire l'objectif">−</button><b>{questionGoal} QCM</b><button onClick={() => updateGoal(questionGoal + 5)} aria-label="Augmenter l'objectif">+</button></div></div>
        <div className="dailyGoalList">
          <div className="dailyGoalRow"><div className="dailyGoalLabel"><span className="goalIcon purple">Q</span><div><b>Questions du jour</b><small>{data.today.answers}/{questionGoal} répondues</small></div></div><div className="goalProgress"><i style={{ width: `${questionGoalRate}%` }} /></div><strong>{questionGoalRate}%</strong></div>
          <div className="dailyGoalRow"><div className="dailyGoalLabel"><span className="goalIcon blue">S</span><div><b>Session complète</b><small>{data.today.sessions ? 'Objectif validé' : 'Encore une session à terminer'}</small></div></div><div className="goalProgress"><i style={{ width: `${sessionGoalRate}%` }} /></div><strong>{sessionGoalRate}%</strong></div>
          <div className="dailyGoalRow"><div className="dailyGoalLabel"><span className="goalIcon green">T</span><div><b>Temps de concentration</b><small>{data.today.minutes}/30 minutes</small></div></div><div className="goalProgress"><i style={{ width: `${minuteGoalRate}%` }} /></div><strong>{minuteGoalRate}%</strong></div>
        </div>
      </section>

      <section className="card activityCard">
        <div className="sectionHead"><div><span className="sectionKicker">6 DERNIÈRES SEMAINES</span><h2>Calendrier d’activité</h2></div><span className="activityTotal">{data.activity.reduce((sum, day) => sum + day.count, 0)} actions</span></div>
        <div className="activityWeekLabels"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
        <div className="activityGrid">{data.activity.map((day) => <div key={day.date} className={`activityCell level${activityLevel(day.count, maxActivity)}`} title={`${day.label} · ${day.count} réponse${day.count > 1 ? 's' : ''}`}><span>{day.count || ''}</span></div>)}</div>
        <div className="activityLegend"><span>Moins</span>{[0,1,2,3,4].map((level) => <i key={level} className={`level${level}`} />)}<span>Plus</span></div>
      </section>
    </div>

    <div className="dashboardMainGrid secondRow">
      <section className="card weakSubjectsCard">
        <div className="sectionHead"><div><span className="sectionKicker">PRIORITÉS</span><h2>Matières les plus faibles</h2></div><Link href="/stats">Toutes les statistiques →</Link></div>
        {data.weakest.length ? <div className="weakSubjectList">{data.weakest.map((item, index) => <article key={item.subject}><span className="weakRank">{index + 1}</span><div className="weakSubjectMain"><div><b>{item.subject}</b><span>{item.attempts} réponses · {item.coverage}% de la banque vue</span></div><div className="weakBar"><i style={{ width: `${item.rate}%` }} /></div></div><strong>{item.rate}%</strong><Link href="/train">Travailler</Link></article>)}</div> : <div className="emptyState compact"><b>Pas encore assez de données</b><span>Quelques séries permettront d’identifier tes matières prioritaires.</span></div>}
      </section>

      <section className="card recentSessionsCard">
        <div className="sectionHead"><div><span className="sectionKicker">HISTORIQUE</span><h2>Dernières sessions</h2></div><Link href="/stats">Voir le bilan →</Link></div>
        {data.sessions.length ? <div className="sessionTimeline">{data.sessions.slice(0, 6).map((session) => { const rate = session.total ? Math.round((session.score / session.total) * 100) : 0; return <article key={session.id}><span className={`sessionDot ${rate >= 70 ? 'good' : rate >= 50 ? 'warn' : 'bad'}`} /><div><b>{session.subject || (session.mode === 'crfpa-exam' ? 'Examen blanc CRFPA' : 'Toutes matières')}</b><span>{new Date(session.createdAt).toLocaleDateString('fr-FR')} · {formatDuration(session.durationSeconds)}</span></div><strong>{session.score}/{session.total}</strong></article> })}</div> : <div className="emptyState compact"><b>Aucune session enregistrée</b><span>Ta prochaine session apparaîtra ici.</span></div>}
      </section>
    </div>

    <section className="card chapterProgressCard">
      <div className="sectionHead"><div><span className="sectionKicker">COUVERTURE DU PROGRAMME</span><h2>Progression par chapitre</h2><p className="muted">Les chapitres sont classés selon leur niveau de travail et de maîtrise.</p></div><Link className="btn btnGhost" href="/train">Choisir mes chapitres</Link></div>
      {data.chapters.length ? <div className="chapterProgressGrid">{data.chapters.map((chapter) => <article key={`${chapter.subject}-${chapter.topic}`}><div className="chapterHead"><div><span>{chapter.subject}</span><b>{chapter.topic}</b></div><strong>{chapter.rate}%</strong></div><div className="chapterBars"><div><span>Couverture</span><div className="progress"><i style={{ width: `${chapter.coverage}%` }} /></div><small>{chapter.uniqueSeen}/{chapter.totalQuestions}</small></div><div><span>Maîtrise</span><div className="progress masteryBar"><i style={{ width: `${chapter.rate}%` }} /></div><small>{chapter.attempts} réponses</small></div></div></article>)}</div> : <div className="emptyState"><b>Aucun chapitre travaillé pour le moment.</b><Link className="btn btnPrimary" href="/train?preset=quick">Démarrer maintenant</Link></div>}
    </section>
  </>
}
