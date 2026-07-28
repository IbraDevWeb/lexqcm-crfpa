import fs from 'node:fs/promises'
import path from 'node:path'

const generatedDir = path.join(process.cwd(), 'public', 'generated')
const OPTION_ORDER_VERSION = 4

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

function shuffle(entries, random) {
  const result = [...entries]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function combinations(size, count) {
  const result = []
  const visit = (start, current) => {
    if (current.length === count) {
      result.push([...current])
      return
    }
    for (let index = start; index <= size - (count - current.length); index += 1) {
      current.push(index)
      visit(index + 1, current)
      current.pop()
    }
  }
  visit(0, [])
  return result
}

function reorderQuestion(question, targetAnswers) {
  const answerSet = new Set(question.answers)
  const hasAlignedExplanations = Array.isArray(question.optionExplanations)
    && question.optionExplanations.length === question.options.length
  const entries = question.options.map((option, originalIndex) => ({
    option,
    originalIndex,
    optionExplanation: hasAlignedExplanations ? question.optionExplanations[originalIndex] : undefined,
  }))
  const random = seededRandom(stableHash(`published-multiple-v${OPTION_ORDER_VERSION}:${question.id}`))
  const correct = shuffle(entries.filter((entry) => answerSet.has(entry.originalIndex)), random)
  const incorrect = shuffle(entries.filter((entry) => !answerSet.has(entry.originalIndex)), random)
  const targetSet = new Set(targetAnswers)
  let correctIndex = 0
  let incorrectIndex = 0
  const reordered = entries.map((_, index) => targetSet.has(index) ? correct[correctIndex++] : incorrect[incorrectIndex++])

  return {
    ...question,
    options: reordered.map((entry) => entry.option),
    answers: [...targetAnswers],
    optionExplanations: hasAlignedExplanations
      ? reordered.map((entry) => entry.optionExplanation)
      : question.optionExplanations,
  }
}

function balanceMultipleAnswers(questions) {
  const targets = new Map()
  const groups = new Map()
  questions.forEach((question) => {
    if (!Array.isArray(question.answers) || question.answers.length <= 1) return
    const key = `${question.options.length}::${question.answers.length}`
    const group = groups.get(key) || []
    group.push(question)
    groups.set(key, group)
  })

  groups.forEach((group) => {
    const optionCount = group[0].options.length
    const answerCount = group[0].answers.length
    const patterns = combinations(optionCount, answerCount)
      .sort((left, right) => stableHash(`pattern:${left.join('-')}`) - stableHash(`pattern:${right.join('-')}`))
    group.slice().sort((left, right) => {
      const difference = stableHash(`multiple-balance:${left.id}`) - stableHash(`multiple-balance:${right.id}`)
      return difference || left.id.localeCompare(right.id, 'fr')
    }).forEach((question, index) => targets.set(question.id, patterns[index % patterns.length]))
  })

  return questions.map((question) => {
    const target = targets.get(question.id)
    return target ? reorderQuestion(question, target) : question
  })
}

function multiplePatternStats(questions) {
  const patterns = {}
  let count = 0
  questions.forEach((question) => {
    if (question.answers.length <= 1) return
    count += 1
    const key = `${question.options.length}:${question.answers.join('-')}`
    patterns[key] = (patterns[key] || 0) + 1
  })
  return { count, patternCount: Object.keys(patterns).length, patterns }
}

async function main() {
  const questionsPath = path.join(generatedDir, 'questions.json')
  const metaPath = path.join(generatedDir, 'meta.json')
  const qualityPath = path.join(generatedDir, 'quality-report.json')
  const [questions, meta, quality] = await Promise.all([
    fs.readFile(questionsPath, 'utf8').then(JSON.parse),
    fs.readFile(metaPath, 'utf8').then(JSON.parse),
    fs.readFile(qualityPath, 'utf8').then(JSON.parse),
  ])
  if (!Array.isArray(questions)) throw new Error('Banque publiée invalide avant équilibrage des QRM.')

  const balanced = balanceMultipleAnswers(questions)
  const stats = multiplePatternStats(balanced)
  if (stats.count > 0 && stats.patternCount < Math.min(3, stats.count)) {
    throw new Error(`Les ${stats.count} QRM ne produisent que ${stats.patternCount} combinaison(s) de réponses.`)
  }

  await Promise.all([
    fs.writeFile(questionsPath, JSON.stringify(balanced)),
    fs.writeFile(metaPath, JSON.stringify({
      ...meta,
      optionOrderVersion: OPTION_ORDER_VERSION,
      multipleAnswerStats: stats,
    }, null, 2)),
    fs.writeFile(qualityPath, JSON.stringify({
      ...quality,
      optionOrderVersion: OPTION_ORDER_VERSION,
      multipleAnswerStats: stats,
    }, null, 2)),
  ])

  console.log(`[LexQCM] QRM rééquilibrés en ordre v${OPTION_ORDER_VERSION} : ${stats.count} questions, ${stats.patternCount} combinaisons distinctes.`)
}

await main()
