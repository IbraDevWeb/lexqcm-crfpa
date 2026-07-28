import fs from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { buildQualityReport } from './question-quality.mjs'

const root = process.cwd()
const outputDir = path.join(root, 'public', 'generated')
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

function validQuestion(q) {
  return q && typeof q.id === 'string' && typeof q.subject === 'string' && typeof q.topic === 'string' && typeof q.stem === 'string' && Array.isArray(q.options) && q.options.length >= 2 && Array.isArray(q.answers) && q.answers.every((a) => Number.isInteger(a) && a >= 0 && a < q.options.length)
}

function validCase(c) {
  return c && typeof c.id === 'string' && typeof c.title === 'string' && typeof c.scenario === 'string' && Array.isArray(c.questions)
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
    throw new Error(`Structure invalide ou identifiants dupliqués : ${structurallyValid.length}/${expectedQuestionCount} questions valides.`)
  }

  const { kept: qualityQuestions, excluded, report: qualityReport } = buildQualityReport(structurallyValid)
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

  await fs.writeFile(path.join(outputDir, 'questions.json'), JSON.stringify(qualityQuestions))
  await fs.writeFile(path.join(outputDir, 'cases.json'), JSON.stringify(uniqueCases))
  await fs.writeFile(path.join(outputDir, 'quality-report.json'), JSON.stringify(qualityReport, null, 2))
  await fs.writeFile(path.join(outputDir, 'questions-editorial-review.json'), JSON.stringify([], null, 2))
  await fs.writeFile(path.join(outputDir, 'meta.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceQuestionCount: expectedQuestionCount,
    questionCount: expectedQuestionCount,
    editorialReviewCount: 0,
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
  console.log(`[LexQCM] ${uniqueCases.length} dossiers progressifs conservés indépendamment de la banque QCM.`)
}

await main()
