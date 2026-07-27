import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'

const root = process.cwd()
const dataDir = path.join(root, 'data')
const outputDir = path.join(root, 'public', 'generated')

const questions = []
const cases = []

function isQuestion(item) {
  return item && typeof item === 'object' && typeof item.id === 'string' && typeof item.stem === 'string' && Array.isArray(item.options) && Array.isArray(item.answers)
}

function isCase(item) {
  return item && typeof item === 'object' && typeof item.id === 'string' && typeof item.scenario === 'string' && Array.isArray(item.questions)
}

function collect(value) {
  if (!Array.isArray(value) || !value.length) return
  const q = value.filter(isQuestion)
  if (q.length >= Math.max(1, Math.floor(value.length * 0.6))) questions.push(...q)
  const c = value.filter(isCase)
  if (c.length >= Math.max(1, Math.floor(value.length * 0.6))) cases.push(...c)
}

async function walk(dir) {
  const files = []
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) files.push(...await walk(full))
      else files.push(full)
    }
  } catch {}
  return files
}

function evaluateJs(code, filename) {
  const sharedWindow = {
    QUESTION_BANK: [],
    CASE_BANK: [],
  }
  const sandbox = {
    window: sharedWindow,
    self: sharedWindow,
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Set,
    Map,
  }
  sandbox.globalThis = sharedWindow

  try {
    const wrapped = `(() => {\n${code}\n;return {\nQUESTION_BANK: typeof QUESTION_BANK !== 'undefined' ? QUESTION_BANK : undefined,\nCASE_BANK: typeof CASE_BANK !== 'undefined' ? CASE_BANK : undefined,\nQUESTIONS: typeof QUESTIONS !== 'undefined' ? QUESTIONS : undefined,\nCASES: typeof CASES !== 'undefined' ? CASES : undefined,\nquestions: typeof questions !== 'undefined' ? questions : undefined,\ncases: typeof cases !== 'undefined' ? cases : undefined\n};\n})()`
    const result = vm.runInNewContext(wrapped, sandbox, { filename, timeout: 5000 })
    Object.values(result || {}).forEach(collect)
  } catch {
    // Some legacy files include browser-only code. Window assignments below may still have succeeded.
  }

  Object.values(sharedWindow).forEach(collect)
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true })
  const files = await walk(dataDir)

  for (const file of files) {
    const ext = path.extname(file).toLowerCase()
    if (!['.js', '.mjs', '.json'].includes(ext)) continue
    try {
      const text = await fs.readFile(file, 'utf8')
      if (ext === '.json') {
        const parsed = JSON.parse(text)
        if (Array.isArray(parsed)) collect(parsed)
        else if (parsed && typeof parsed === 'object') Object.values(parsed).forEach(collect)
      } else {
        evaluateJs(text, file)
      }
    } catch {}
  }

  // Last-resort extraction from inline data scripts in the legacy index.
  if (!questions.length || !cases.length) {
    try {
      const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
      const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1])
      for (const script of scripts) {
        if (/QUESTION_BANK|CASE_BANK|QUESTIONS|CASES/.test(script)) evaluateJs(script, 'index.html:inline')
      }
    } catch {}
  }

  const uniqueQuestions = [...new Map(questions.map((item) => [item.id, item])).values()].filter((q) => q.active !== false)
  const uniqueCases = [...new Map(cases.map((item) => [item.id, item])).values()]

  const fallbackQuestions = [
    {
      id: 'demo-force-majeure-1218',
      subject: 'Droit des contrats',
      topic: 'Force majeure',
      mode: 'demo',
      type: 'single',
      difficulty: 1,
      stem: 'En cas d’inexécution non imputable au débiteur résultant d’une force majeure, l’article 1218 prévoit principalement :',
      options: ['Une nullité automatique', 'La suspension de l’obligation ou la résolution selon les cas', 'Une peine civile obligatoire', 'Une novation'],
      answers: [1],
      explanation: 'Le cours distingue l’inexécution imputable du cas de force majeure, qui peut conduire à une suspension ou à la résolution.',
      source: { label: 'Question de démonstration LexQCM' }
    }
  ]

  const finalQuestions = uniqueQuestions.length ? uniqueQuestions : fallbackQuestions
  await fs.writeFile(path.join(outputDir, 'questions.json'), JSON.stringify(finalQuestions))
  await fs.writeFile(path.join(outputDir, 'cases.json'), JSON.stringify(uniqueCases))
  await fs.writeFile(path.join(outputDir, 'meta.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    questionCount: finalQuestions.length,
    caseCount: uniqueCases.length,
    importedFromLegacy: uniqueQuestions.length > 0,
  }, null, 2))

  console.log(`[LexQCM] ${finalQuestions.length} questions et ${uniqueCases.length} dossiers exportés vers public/generated.`)
}

await main()
