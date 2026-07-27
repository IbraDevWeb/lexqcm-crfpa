export type QuestionStat = {
  seen: number
  correct: number
  wrong: number
  reps: number
  interval: number
  ease: number
  due: string
  last: string | null
}

export type HistoryEntry = {
  id: string
  subject: string
  topic: string
  ok: boolean
  date: string
}

export type ProgressState = {
  version: 3
  answered: number
  correct: number
  favorites: string[]
  questionStats: Record<string, QuestionStat>
  history: HistoryEntry[]
  lastStudy: string | null
  streak: number
}

export const emptyProgress = (): ProgressState => ({
  version: 3,
  answered: 0,
  correct: 0,
  favorites: [],
  questionStats: {},
  history: [],
  lastStudy: null,
  streak: 0,
})

export const today = () => new Date().toISOString().slice(0, 10)

export function addDays(days: number) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function questionStat(progress: ProgressState, id: string): QuestionStat {
  return progress.questionStats[id] ?? {
    seen: 0,
    correct: 0,
    wrong: 0,
    reps: 0,
    interval: 0,
    ease: 2.5,
    due: today(),
    last: null,
  }
}

export function isDue(progress: ProgressState, id: string) {
  return (questionStat(progress, id).due || today()) <= today()
}

export function recordAnswer(
  input: ProgressState,
  question: { id: string; subject: string; topic: string },
  ok: boolean,
): ProgressState {
  const progress: ProgressState = structuredClone(input)
  const stat = questionStat(progress, question.id)
  stat.seen += 1
  stat.last = today()

  if (ok) {
    stat.correct += 1
    stat.reps += 1
    stat.ease = Math.min(3, stat.ease + 0.05)
    stat.interval =
      stat.reps === 1
        ? 1
        : stat.reps === 2
          ? 3
          : Math.max(5, Math.round((stat.interval || 3) * stat.ease))
  } else {
    stat.wrong += 1
    stat.reps = 0
    stat.ease = Math.max(1.7, stat.ease - 0.2)
    stat.interval = 1
  }

  stat.due = addDays(stat.interval)
  progress.questionStats[question.id] = stat
  progress.answered += 1
  if (ok) progress.correct += 1

  progress.history.push({
    id: question.id,
    subject: question.subject,
    topic: question.topic,
    ok,
    date: new Date().toISOString(),
  })
  if (progress.history.length > 4000) progress.history = progress.history.slice(-4000)

  const current = today()
  if (progress.lastStudy !== current) {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayKey = yesterday.toISOString().slice(0, 10)
    progress.streak = progress.lastStudy === yesterdayKey ? progress.streak + 1 : 1
    progress.lastStudy = current
  }

  return progress
}

export function normalizeProgress(value: unknown): ProgressState {
  if (!value || typeof value !== 'object') return emptyProgress()
  const raw = value as Partial<ProgressState>
  return {
    ...emptyProgress(),
    ...raw,
    version: 3,
    favorites: Array.isArray(raw.favorites) ? raw.favorites.filter((x): x is string => typeof x === 'string') : [],
    questionStats: raw.questionStats && typeof raw.questionStats === 'object' ? raw.questionStats : {},
    history: Array.isArray(raw.history) ? raw.history.slice(-4000) : [],
  }
}
