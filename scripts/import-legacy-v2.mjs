import fs from 'node:fs/promises'
import path from 'node:path'
import { buildQualityReport } from './question-quality.mjs'

const root = process.cwd()
const outputDir = path.join(root, 'public', 'generated')

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

async function readBank(file, assignment) {
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
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'fr'))

  const questions = []
  for (const file of files) {
    const value = JSON.parse(await fs.readFile(path.join(absolute, file), 'utf8'))
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

  const dataQuestions = await readBank('data/questions.js', 'window.QUESTION_BANK=')
  const dataCases = await readBank('data/cases.js', 'window.CASE_BANK=')
  const procedureCivile2026 = await readQuestionDirectory('data/procedure-civile-2026')

  let htmlQuestions = null
  let htmlCases = null
  try {
    const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
    htmlQuestions = extractAssignedJson(html, 'window.QUESTION_BANK=')
    htmlCases = extractAssignedJson(html, 'window.CASE_BANK=')
  } catch {}

  const legacyQuestions = richer(dataQuestions, htmlQuestions)
  const questions = [...legacyQuestions, ...procedureCivile2026]
  const cases = richer(dataCases, htmlCases)

  if (!legacyQuestions.length) throw new Error('QUESTION_BANK introuvable dans la V1.')
  if (!cases.length) throw new Error('CASE_BANK introuvable dans la V1.')
  if (procedureCivile2026.length !== 120) {
    throw new Error(`Lot procédure civile 2026 incomplet : ${procedureCivile2026.length}/120 questions.`)
  }

  const structurallyValid = [...new Map(questions.filter((q) => q.active !== false && validQuestion(q)).map((q) => [q.id, q])).values()]
  const { kept: qualityQuestions, excluded, report: qualityReport } = buildQualityReport(structurallyValid)
  const uniqueCases = [...new Map(cases.filter(validCase).map((c) => [c.id, c])).values()]
  const publishedProcedureCivile2026 = qualityQuestions.filter((q) => q.id.startsWith('PC26-CORR-'))

  if (publishedProcedureCivile2026.length !== procedureCivile2026.length) {
    throw new Error(`Le contrôle éditorial a écarté ${procedureCivile2026.length - publishedProcedureCivile2026.length} question(s) du lot procédure civile 2026.`)
  }

  await fs.writeFile(path.join(outputDir, 'questions.json'), JSON.stringify(qualityQuestions))
  await fs.writeFile(path.join(outputDir, 'cases.json'), JSON.stringify(uniqueCases))
  await fs.writeFile(path.join(outputDir, 'quality-report.json'), JSON.stringify(qualityReport, null, 2))
  await fs.writeFile(path.join(outputDir, 'questions-editorial-review.json'), JSON.stringify(excluded.map(({ question, reasons }) => ({
    id: question.id,
    subject: question.subject,
    topic: question.topic,
    stem: question.stem,
    options: question.options,
    answers: question.answers,
    explanation: question.explanation,
    source: question.source,
    mode: question.mode,
    reasons,
  })), null, 2))
  await fs.writeFile(path.join(outputDir, 'meta.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceQuestionCount: structurallyValid.length,
    questionCount: qualityQuestions.length,
    editorialReviewCount: excluded.length,
    procedureCivileCorrectionQuestionCount: publishedProcedureCivile2026.length,
    caseCount: uniqueCases.length,
    correctedCaseCount: uniqueCases.filter((c) => c.status !== 'source_only').length,
    pendingCaseCount: uniqueCases.filter((c) => c.status === 'source_only').length,
    importedFromLegacy: true,
  }, null, 2))

  console.log(`[LexQCM] ${qualityQuestions.length} questions utiles conservées / ${excluded.length} questions retirées pour revue éditoriale / ${uniqueCases.length} dossiers.`)
  console.log(`[LexQCM] ${publishedProcedureCivile2026.length} nouvelles questions de procédure civile issues des corrigés 2026.`)
  qualityReport.categories.forEach((category) => console.log(`[LexQCM][qualité] ${category.count} — ${category.label}`))
}

await main()
