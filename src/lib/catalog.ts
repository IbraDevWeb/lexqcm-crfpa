export type QuestionSource = {
  label?: string
  url?: string
  kind?: string
  verified?: string
  asOf?: string
}

export type LexQuestion = {
  id: string
  subject: string
  topic: string
  difficulty?: number
  type?: 'single' | 'multiple'
  mode?: string
  stem: string
  options: string[]
  answers: number[]
  explanation?: string
  optionExplanations?: string[]
  source?: QuestionSource
  tags?: string[]
  active?: boolean
}

export type CaseQuestion = {
  id: string
  phase?: string
  type?: 'single' | 'multiple'
  stem: string
  options: string[]
  answers: number[]
  explanation?: string
  reasoning?: string
  legalRefs?: string[]
  verified?: { status?: string; label?: string; url?: string } | null
  source?: QuestionSource
}

export type LexCase = {
  id: string
  title: string
  subject?: string
  topic?: string
  provider?: string
  year?: number
  scenario: string
  status?: string
  warning?: string | null
  questions: CaseQuestion[]
  source?: QuestionSource & { pages?: string }
}

export const modeLabel = (mode?: string) => ({
  curated: 'QCM validé',
  drill: 'Drill mémoire',
  synthesis: 'QRM synthèse',
  update: 'Actualisé 2026',
  case: 'Cas pratique',
}[mode ?? ''] ?? mode ?? 'Standard')

export const isOfficialUpdate = (q: LexQuestion) => q.mode === 'update' || q.source?.kind === 'official'
