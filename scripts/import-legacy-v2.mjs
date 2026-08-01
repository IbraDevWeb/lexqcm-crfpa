import fs from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { buildQualityReport } from './question-quality.mjs'

const root = process.cwd()
const outputDir = path.join(root, 'public', 'generated')
const OPTION_ORDER_VERSION = 2
const cleanQuestionSets = [
  {
    directory: 'data/procedure-civile-2026',
    expected: 120,
    subject: 'Procédure civile',
    prefix: 'PC26-CORR-',
    label: 'Pré-Barreau 2026 — 12 corrigés de procédure civile',
  },
  {
    directory: 'data/procedure-civile-2025',
    expected: 180,
    subject: 'Procédure civile',
    prefix: 'PC25-CORR-',
    label: 'Pré-Barreau 2025 — 15 corrigés de procédure civile',
  },
  {
    directory: 'data/obligations-2026',
    expected: 120,
    subject: 'Droit des obligations',
    prefix: 'OB26-CORR-',
    label: 'Pré-Barreau 2026 — 12 corrigés de droit des obligations',
  },
  {
    directory: 'data/droit-social-2026',
    expected: 120,
    subject: 'Droit social',
    prefix: 'DS26-CORR-',
    label: 'Pré-Barreau et Objectif Barreau 2026 — 12 corrigés de droit social',
  },
]

function extractAssignedJson(source, assignment) {
  const marker = source.indexOf(assignment)
  if (marker < 0) return null
  const start = source.indexOf('[', marker + assignment.length)
  if (start < 0) return null

  let inString = false
  let escaped = false
  let depth = 0
  for (let i = start; i < source.length; i += 1) {
    const char = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '[') depth += 1
    else if (char === ']') {
      depth -= 1
      if (depth === 0) return JSON.parse(source.slice(start, i + 1))
    }
  }
  return null
}

async function readAssignedBank(file, assignment) {
  try {
    const source = await fs.readFile(path.join(root, file), 'utf8')
    return extractAssignedJson(source, assignment)
  } catch {
    return null
  }
}

async function readQuestionDirectory(directory) {
  const absolute = path.join(root, directory)
  const entries = await fs.readdir(absolute, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.json.gz.b64')))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'fr'))

  const questions = []
  for (const file of files) {
    const filePath = path.join(absolute, file)
    let value
    if (file.endsWith('.json.gz.b64')) {
      const encoded = (await fs.readFile(filePath, 'utf8')).trim()
      value = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'))
    } else {
      value = JSON.parse(await fs.readFile(filePath, 'utf8'))
    }
    if (!Array.isArray(value)) throw new Error(`${directory}/${file} ne contient pas un tableau de questions.`)
    questions.push(...value)
  }
  return questions
}

function richer(a, b) {
  const left = Array.isArray(a) ? a : []
  const right = Array.isArray(b) ? b : []
  return right.length > left.length ? right : left
}

function normalizeOption(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function validQuestion(q) {
  if (!q || typeof q.id !== 'string' || typeof q.subject !== 'string' || typeof q.topic !== 'string' || typeof q.stem !== 'string') return false
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.some((option) => typeof option !== 'string' || !option.trim())) return false
  if (new Set(q.options.map(normalizeOption)).size !== q.options.length) return false
  if (!Array.isArray(q.answers) || q.answers.length === 0 || new Set(q.answers).size !== q.answers.length) return false
  if (!q.answers.every((answer) => Number.isInteger(answer) && answer >= 0 && answer < q.options.length)) return false
  if (q.type === 'single' && q.answers.length !== 1) return false
  if (q.type === 'multiple' && q.answers.length < 2) return false
  return true
}

function validCase(c) {
  return c && typeof c.id === 'string' && typeof c.title === 'string' && typeof c.scenario === 'string' && Array.isArray(c.questions)
}

function stableHash(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleQuestionOptions(question, forcedCorrectPosition = null) {
  const hasAlignedExplanations = Array.isArray(question.optionExplanations)
    && question.optionExplanations.length === question.options.length
  const entries = question.options.map((option, originalIndex) => ({
    option,
    originalIndex,
    optionExplanation: hasAlignedExplanations ? question.optionExplanations[originalIndex] : undefined,
  }))
  const random = seededRandom(stableHash(`lexqcm-option-order-v${OPTION_ORDER_VERSION}:${question.id}:${question.stem}`))

  for (let index = entries.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[entries[index], entries[target]] = [entries[target], entries[index]]
  }

  if (question.answers.length === 1 && Number.isInteger(forcedCorrectPosition)) {
    const correctOriginalIndex = question.answers[0]
    const currentCorrectPosition = entries.findIndex((entry) => entry.originalIndex === correctOriginalIndex)
    if (currentCorrectPosition !== forcedCorrectPosition) {
      ;[entries[currentCorrectPosition], entries[forcedCorrectPosition]] = [entries[forcedCorrectPosition], entries[currentCorrectPosition]]
    }
  }

  const answerSet = new Set(question.answers)
  const answers = entries
    .map((entry, newIndex) => (answerSet.has(entry.originalIndex) ? newIndex : -1))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)

  return {
    ...question,
    options: entries.map((entry) => entry.option),
    answers,
    optionExplanations: hasAlignedExplanations
      ? entries.map((entry) => entry.optionExplanation)
      : question.optionExplanations,
  }
}

function randomizeOptionOrder(questions) {
  const forcedPositions = new Map()
  const singleAnswerGroups = new Map()

  questions.forEach((question) => {
    if (question.answers.length !== 1) return
    const key = `${question.subject}::${question.options.length}`
    const group = singleAnswerGroups.get(key) || []
    group.push(question)
    singleAnswerGroups.set(key, group)
  })

  singleAnswerGroups.forEach((group) => {
    group
      .slice()
      .sort((left, right) => {
        const hashDifference = stableHash(`balance:${left.id}`) - stableHash(`balance:${right.id}`)
        return hashDifference || left.id.localeCompare(right.id, 'fr')
      })
      .forEach((question, index) => {
        forcedPositions.set(question.id, index % question.options.length)
      })
  })

  return questions.map((question) => shuffleQuestionOptions(question, forcedPositions.get(question.id)))
}

function answerPositionStats(questions) {
  const bySubject = {}
  let singleAnswerCount = 0
  let multipleAnswerCount = 0

  questions.forEach((question) => {
    const subject = question.subject || 'Matière inconnue'
    bySubject[subject] ||= { singleAnswerCount: 0, multipleAnswerCount: 0, positions: {} }
    if (question.answers.length === 1) {
      singleAnswerCount += 1
      bySubject[subject].singleAnswerCount += 1
      const position = String.fromCharCode(65 + question.answers[0])
      bySubject[subject].positions[position] = (bySubject[subject].positions[position] || 0) + 1
    } else {
      multipleAnswerCount += 1
      bySubject[subject].multipleAnswerCount += 1
    }
  })

  return { singleAnswerCount, multipleAnswerCount, bySubject }
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true })

  // Base saine : aucune ancienne QUESTION_BANK n'est lue ou fusionnée.
  // Seuls les lots éditoriaux explicitement listés ci-dessus sont publiés.
  const sourceQuestions = []
  for (const set of cleanQuestionSets) {
    const setQuestions = await readQuestionDirectory(set.directory)
    if (setQuestions.length !== set.expected) {
      throw new Error(`Lot ${set.subject} (${set.prefix}) incomplet : ${setQuestions.length}/${set.expected} questions.`)
    }
    if (setQuestions.some((q) => q.subject !== set.subject || !q.id?.startsWith(set.prefix))) {
      throw new Error(`Une question étrangère au lot ${set.subject} (${set.prefix}) a été détectée.`)
    }
    sourceQuestions.push(...setQuestions)
  }

  // Les dossiers progressifs sont un catalogue distinct des QCM et restent conservés.
  const dataCases = await readAssignedBank('data/cases.js', 'window.CASE_BANK=')
  const htmlCases = await readAssignedBank('index.html', 'window.CASE_BANK=')
  const cases = richer(dataCases, htmlCases)
  if (!cases.length) throw new Error('CASE_BANK introuvable dans les sources existantes.')

  const expectedQuestionCount = cleanQuestionSets.reduce((sum, set) => sum + set.expected, 0)
  const structurallyValid = [...new Map(sourceQuestions
    .filter((q) => q.active !== false && validQuestion(q))
    .map((q) => [q.id, q])).values()]

  if (structurallyValid.length !== expectedQuestionCount) {
    throw new Error(`Structure invalide, options dupliquées ou identifiants dupliqués : ${structurallyValid.length}/${expectedQuestionCount} questions valides.`)
  }

  const { kept, excluded, report: qualityReport } = buildQualityReport(structurallyValid)
  const qualityQuestions = randomizeOptionOrder(kept)
  const uniqueCases = [...new Map(cases.filter(validCase).map((c) => [c.id, c])).values()]

  if (qualityQuestions.length !== expectedQuestionCount || excluded.length !== 0) {
    throw new Error(`Le contrôle éditorial a écarté ${excluded.length} question(s) du socle sain.`)
  }

  const countsBySet = Object.fromEntries(cleanQuestionSets.map((set) => [
    set.prefix,
    qualityQuestions.filter((q) => q.subject === set.subject && q.id.startsWith(set.prefix)).length,
  ]))
  for (const set of cleanQuestionSets) {
    if (countsBySet[set.prefix] !== set.expected) {
      throw new Error(`Comptage invalide pour ${set.subject} (${set.prefix}) : ${countsBySet[set.prefix]}/${set.expected}.`)
    }
  }

  const countsBySubject = qualityQuestions.reduce((counts, question) => {
    counts[question.subject] = (counts[question.subject] || 0) + 1
    return counts
  }, {})
  const positionStats = answerPositionStats(qualityQuestions)

  await fs.writeFile(path.join(outputDir, 'questions.json'), JSON.stringify(qualityQuestions))
  await fs.writeFile(path.join(outputDir, 'cases.json'), JSON.stringify(uniqueCases))
  await fs.writeFile(path.join(outputDir, 'quality-report.json'), JSON.stringify({
    ...qualityReport,
    optionOrderVersion: OPTION_ORDER_VERSION,
    answerPositionStats: positionStats,
  }, null, 2))
  await fs.writeFile(path.join(outputDir, 'questions-editorial-review.json'), JSON.stringify([], null, 2))
  await fs.writeFile(path.join(outputDir, 'meta.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceQuestionCount: expectedQuestionCount,
    questionCount: expectedQuestionCount,
    editorialReviewCount: 0,
    optionOrderVersion: OPTION_ORDER_VERSION,
    answerPositionStats: positionStats,
    procedureCivileCorrectionQuestionCount: countsBySubject['Procédure civile'],
    procedureCivile2026QuestionCount: countsBySet['PC26-CORR-'],
    procedureCivile2025QuestionCount: countsBySet['PC25-CORR-'],
    obligationsCorrectionQuestionCount: countsBySubject['Droit des obligations'],
    droitSocialCorrectionQuestionCount: countsBySubject['Droit social'],
    questionsBySubject: countsBySubject,
    cleanQuestionBase: true,
    questionSources: cleanQuestionSets.map((set) => set.label),
    caseCount: uniqueCases.length,
    correctedCaseCount: uniqueCases.filter((c) => c.status !== 'source_only').length,
    pendingCaseCount: uniqueCases.filter((c) => c.status === 'source_only').length,
    importedFromLegacy: false,
  }, null, 2))

  console.log(`[LexQCM] Base QCM saine : ${qualityQuestions.length} questions, aucune question legacy.`)
  cleanQuestionSets.forEach((set) => console.log(`[LexQCM] ${countsBySet[set.prefix]} questions — ${set.subject} (${set.prefix}).`))
  console.log(`[LexQCM] Ordre des réponses v${OPTION_ORDER_VERSION} : positions mélangées, stables et équilibrées.`)
  Object.entries(positionStats.bySubject).forEach(([subject, stats]) => {
    console.log(`[LexQCM] ${subject} — réponses uniques : ${JSON.stringify(stats.positions)}.`)
  })
  console.log(`[LexQCM] ${uniqueCases.length} dossiers progressifs conservés indépendamment de la banque QCM.`)
}

await main()
