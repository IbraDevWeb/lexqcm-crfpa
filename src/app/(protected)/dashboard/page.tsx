import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { DashboardClient, type DashboardData } from '@/components/dashboard-client'
import type { LexQuestion } from '@/lib/catalog'
import { createClient } from '@/lib/supabase/server'
import { emptyProgress, normalizeProgress } from '@/lib/progress'

export const metadata = { title: 'Tableau de bord' }

const PARIS_TIMEZONE = 'Europe/Paris'

function dateKey(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000'
  const month = parts.find((part) => part.type === 'month')?.value ?? '00'
  const day = parts.find((part) => part.type === 'day')?.value ?? '00'
  return `${year}-${month}-${day}`
}

function dateLabel(key: string) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: PARIS_TIMEZONE }).format(new Date(`${key}T12:00:00Z`))
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: progressRow }, { data: sessionRows }, questionText] = await Promise.all([
    supabase.from('user_progress').select('progress').eq('user_id', user!.id).maybeSingle(),
    supabase.from('study_sessions').select('id,mode,subject,score,total,duration_seconds,created_at').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(100),
    readFile(path.join(process.cwd(), 'public', 'generated', 'questions.json'), 'utf8'),
  ])

  const questions = JSON.parse(questionText) as LexQuestion[]
  const progress = progressRow?.progress ? normalizeProgress(progressRow.progress) : emptyProgress()
  const sessions = (sessionRows ?? []).map((session) => ({
    id: String(session.id),
    mode: String(session.mode ?? 'practice'),
    subject: session.subject ? String(session.subject) : null,
    score: Number(session.score) || 0,
    total: Number(session.total) || 0,
    durationSeconds: Number(session.duration_seconds) || 0,
    createdAt: String(session.created_at),
  }))

  const todayKey = dateKey(new Date())
  const rate = progress.answered ? Math.round((progress.correct / progress.answered) * 100) : 0
  const due = Object.values(progress.questionStats).filter((stat) => (stat.due || '') <= todayKey).length
  const fragile = Object.values(progress.questionStats).filter((stat) => stat.wrong > 0 && (stat.correct === 0 || stat.wrong >= stat.correct)).length

  const activityCounts = new Map<string, number>()
  progress.history.forEach((entry) => {
    const key = dateKey(entry.date)
    activityCounts.set(key, (activityCounts.get(key) ?? 0) + 1)
  })
  progress.caseHistory.forEach((entry) => {
    const key = dateKey(entry.date)
    activityCounts.set(key, (activityCounts.get(key) ?? 0) + 1)
  })

  const todayDate = new Date(`${todayKey}T12:00:00Z`)
  const mondayOffset = (todayDate.getUTCDay() + 6) % 7
  const activityStart = new Date(todayDate)
  activityStart.setUTCDate(activityStart.getUTCDate() - mondayOffset - 35)
  const activity = Array.from({ length: 42 }, (_, index) => {
    const current = new Date(activityStart)
    current.setUTCDate(current.getUTCDate() + index)
    const key = current.toISOString().slice(0, 10)
    return { date: key, count: activityCounts.get(key) ?? 0, label: dateLabel(key) }
  })

  const subjectQuestionTotals = new Map<string, number>()
  const chapterTotals = new Map<string, { subject: string; topic: string; totalQuestions: number }>()
  questions.forEach((question) => {
    subjectQuestionTotals.set(question.subject, (subjectQuestionTotals.get(question.subject) ?? 0) + 1)
    const key = `${question.subject}\u0000${question.topic}`
    const current = chapterTotals.get(key) ?? { subject: question.subject, topic: question.topic, totalQuestions: 0 }
    current.totalQuestions += 1
    chapterTotals.set(key, current)
  })

  const subjectStats = new Map<string, { attempts: number; correct: number; uniqueSeen: number }>()
  const chapterStats = new Map<string, { attempts: number; correct: number; uniqueSeen: number }>()
  questions.forEach((question) => {
    const stat = progress.questionStats[question.id]
    if (!stat?.seen) return
    const subject = subjectStats.get(question.subject) ?? { attempts: 0, correct: 0, uniqueSeen: 0 }
    subject.attempts += stat.correct + stat.wrong
    subject.correct += stat.correct
    subject.uniqueSeen += 1
    subjectStats.set(question.subject, subject)

    const key = `${question.subject}\u0000${question.topic}`
    const chapter = chapterStats.get(key) ?? { attempts: 0, correct: 0, uniqueSeen: 0 }
    chapter.attempts += stat.correct + stat.wrong
    chapter.correct += stat.correct
    chapter.uniqueSeen += 1
    chapterStats.set(key, chapter)
  })

  const subjects = [...subjectQuestionTotals.entries()].map(([subject, totalQuestions]) => {
    const stat = subjectStats.get(subject) ?? { attempts: 0, correct: 0, uniqueSeen: 0 }
    return {
      subject,
      attempts: stat.attempts,
      correct: stat.correct,
      uniqueSeen: stat.uniqueSeen,
      totalQuestions,
      rate: stat.attempts ? Math.round((stat.correct / stat.attempts) * 100) : 0,
      coverage: totalQuestions ? Math.round((stat.uniqueSeen / totalQuestions) * 100) : 0,
    }
  }).sort((a, b) => b.attempts - a.attempts)

  const attemptedSubjects = subjects.filter((subject) => subject.attempts > 0)
  const weakestSource = attemptedSubjects.filter((subject) => subject.attempts >= 5).length >= 3
    ? attemptedSubjects.filter((subject) => subject.attempts >= 5)
    : attemptedSubjects
  const weakest = [...weakestSource].sort((a, b) => a.rate - b.rate || b.attempts - a.attempts).slice(0, 3).map(({ subject, attempts, rate: subjectRate, coverage }) => ({ subject, attempts, rate: subjectRate, coverage }))

  const chapters = [...chapterTotals.entries()].map(([key, total]) => {
    const stat = chapterStats.get(key) ?? { attempts: 0, correct: 0, uniqueSeen: 0 }
    return {
      subject: total.subject,
      topic: total.topic,
      attempts: stat.attempts,
      uniqueSeen: stat.uniqueSeen,
      totalQuestions: total.totalQuestions,
      rate: stat.attempts ? Math.round((stat.correct / stat.attempts) * 100) : 0,
      coverage: total.totalQuestions ? Math.round((stat.uniqueSeen / total.totalQuestions) * 100) : 0,
    }
  }).filter((chapter) => chapter.attempts > 0).sort((a, b) => a.rate - b.rate || b.attempts - a.attempts).slice(0, 8)

  const todaySessions = sessions.filter((session) => dateKey(session.createdAt) === todayKey)
  const dashboardData: DashboardData = {
    rate,
    answered: progress.answered,
    correct: progress.correct,
    due,
    fragile,
    favorites: progress.favorites.length,
    streak: progress.streak,
    today: {
      answers: progress.history.filter((entry) => dateKey(entry.date) === todayKey).length,
      sessions: todaySessions.length,
      minutes: Math.round(todaySessions.reduce((sum, session) => sum + session.durationSeconds, 0) / 60),
    },
    activity,
    subjects,
    weakest,
    chapters,
    sessions,
  }

  return <DashboardClient data={dashboardData} />
}
