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

export type CaseStepStat = {
  seen: number
  correct: number
  wrong: number
  last: string | null
}

export type CaseStat = {
  attempts: number
  best: number
  lastScore: number
  completed: boolean
  steps: Record<string, CaseStepStat>
}

export type CaseHistoryEntry = {
  caseId: string
  id: string
  phase?: string
  ok: boolean
  date: string
}

export type ProgressState = {
  version: 4
  answered: number
  correct: number
  favorites: string[]
  questionStats: Record<string, QuestionStat>
  history: HistoryEntry[]
  lastStudy: string | null
  streak: number
  caseStats: Record<string, CaseStat>
  caseHistory: CaseHistoryEntry[]
}

export const emptyProgress = (): ProgressState => ({
  version: 4,
  answered: 0,
  correct: 0,
  favorites: [],
  questionStats: {},
  history: [],
  lastStudy: null,
  streak: 0,
  caseStats: {},
  caseHistory: [],
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

export function caseStat(progress: ProgressState, id: string): CaseStat {
  return progress.caseStats[id] ?? {
    attempts: 0,
    best: 0,
    lastScore: 0,
    completed: false,
    steps: {},
  }
}

export function isDue(progress: ProgressState, id: string) {
  return (questionStat(progress, id).due || today()) <= today()
}

function updateStreak(progress: ProgressState) {
  const current = today()
  if (progress.lastStudy === current) return
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = yesterday.toISOString().slice(0, 10)
  progress.streak = progress.lastStudy === yesterdayKey ? progress.streak + 1 : 1
  progress.lastStudy = current
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
  updateStreak(progress)
  return progress
}

export function recordCaseStep(
  input: ProgressState,
  payload: { caseId: string; questionId: string; phase?: string; ok: boolean },
): ProgressState {
  const progress: ProgressState = structuredClone(input)
  const current = caseStat(progress, payload.caseId)
  const step = current.steps[payload.questionId] ?? { seen: 0, correct: 0, wrong: 0, last: null }
  step.seen += 1
  if (payload.ok) step.correct += 1
  else step.wrong += 1
  step.last = new Date().toISOString()
  current.steps[payload.questionId] = step
  progress.caseStats[payload.caseId] = current
  progress.caseHistory.push({
    caseId: payload.caseId,
    id: payload.questionId,
    phase: payload.phase,
    ok: payload.ok,
    date: new Date().toISOString(),
  })
  if (progress.caseHistory.length > 3000) progress.caseHistory = progress.caseHistory.slice(-3000)
  updateStreak(progress)
  return progress
}

export function completeCase(input: ProgressState, caseId: string, scorePercent: number) {
  const progress: ProgressState = structuredClone(input)
  const current = caseStat(progress, caseId)
  current.attempts += 1
  current.lastScore = scorePercent
  current.best = Math.max(current.best, scorePercent)
  current.completed = true
  progress.caseStats[caseId] = current
  updateStreak(progress)
  return progress
}

export function normalizeProgress(value: unknown): ProgressState {
  if (!value || typeof value !== 'object') return emptyProgress()
  const raw = value as Partial<ProgressState> & { version?: number }
  return {
    ...emptyProgress(),
    ...raw,
    version: 4,
    favorites: Array.isArray(raw.favorites) ? raw.favorites.filter((x): x is string => typeof x === 'string') : [],
    questionStats: raw.questionStats && typeof raw.questionStats === 'object' ? raw.questionStats : {},
    history: Array.isArray(raw.history) ? raw.history.slice(-4000) : [],
    caseStats: raw.caseStats && typeof raw.caseStats === 'object' ? raw.caseStats : {},
    caseHistory: Array.isArray(raw.caseHistory) ? raw.caseHistory.slice(-3000) : [],
  }
}
