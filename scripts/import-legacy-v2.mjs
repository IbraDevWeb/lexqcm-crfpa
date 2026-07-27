import fs from 'node:fs/promises'
import path from 'node:path'

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

  let htmlQuestions = null
  let htmlCases = null
  try {
    const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
    htmlQuestions = extractAssignedJson(html, 'window.QUESTION_BANK=')
    htmlCases = extractAssignedJson(html, 'window.CASE_BANK=')
  } catch {}

  const questions = richer(dataQuestions, htmlQuestions)
  const cases = richer(dataCases, htmlCases)

  if (!questions.length) throw new Error('QUESTION_BANK introuvable dans la V1.')
  if (!cases.length) throw new Error('CASE_BANK introuvable dans la V1.')

  const uniqueQuestions = [...new Map(questions.filter((q) => q.active !== false && validQuestion(q)).map((q) => [q.id, q])).values()]
  const uniqueCases = [...new Map(cases.filter(validCase).map((c) => [c.id, c])).values()]

  await fs.writeFile(path.join(outputDir, 'questions.json'), JSON.stringify(uniqueQuestions))
  await fs.writeFile(path.join(outputDir, 'cases.json'), JSON.stringify(uniqueCases))
  await fs.writeFile(path.join(outputDir, 'meta.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    questionCount: uniqueQuestions.length,
    caseCount: uniqueCases.length,
    correctedCaseCount: uniqueCases.filter((c) => c.status !== 'source_only').length,
    pendingCaseCount: uniqueCases.filter((c) => c.status === 'source_only').length,
    importedFromLegacy: true
  }, null, 2))

  console.log(`[LexQCM] ${uniqueQuestions.length} questions / ${uniqueCases.length} dossiers importés.`)
}

await main()
