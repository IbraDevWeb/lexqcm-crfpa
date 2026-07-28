import fs from 'node:fs/promises'

const meta = JSON.parse(await fs.readFile('public/generated/meta.json', 'utf8'))
const questions = JSON.parse(await fs.readFile('public/generated/questions.json', 'utf8'))
const legalReview = JSON.parse(await fs.readFile('public/generated/questions-legal-review.json', 'utf8'))
const authority = JSON.parse(await fs.readFile('public/generated/legal-authority-report.json', 'utf8'))
const quality = JSON.parse(await fs.readFile('public/generated/quality-report.json', 'utf8'))
const editorialReview = JSON.parse(await fs.readFile('public/generated/questions-editorial-review.json', 'utf8'))
const cases = Number(meta.caseCount || 0)
const expectedSourceTotal = 540
const expectedOptionOrderVersion = 3
const expectedSets = [
  { subject: 'Procédure civile', prefix: 'PC26-CORR-', count: 120 },
  { subject: 'Procédure civile', prefix: 'PC25-CORR-', count: 180 },
  { subject: 'Droit des obligations', prefix: 'OB26-CORR-', count: 120 },
  { subject: 'Droit social', prefix: 'DS26-CORR-', count: 120 },
]

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function isPreciseLegalReference(value) {
  const text = normalize(value)
  return /\d/.test(text)
    && /\b(article|articles|art\.?|cpc|code|cass\.?|civ\.?|soc\.?|com\.?|crim\.?|ass\.? plen\.?|conseil d'etat|\bce\b|cjue|cedh|loi|decret|reglement|directive)\b/.test(text)
}

function hasLegalAuthority(question) {
  return Array.isArray(question.legalRefs)
    && question.legalRefs.length > 0
    && question.legalRefs.every((reference) => typeof reference === 'string' && isPreciseLegalReference(reference))
}

function validateQuestionInternals(question) {
  if (!Array.isArray(question.options) || question.options.length < 2) {
    throw new Error(`${question.id} ne contient pas assez de propositions.`)
  }
  if (question.options.some((option) => typeof option !== 'string' || !option.trim())) {
    throw new Error(`${question.id} contient une proposition vide.`)
  }
  if (new Set(question.options.map(normalize)).size !== question.options.length) {
    throw new Error(`${question.id} contient des propositions identiques ou quasi identiques.`)
  }
  if (!Array.isArray(question.answers) || question.answers.length === 0) {
    throw new Error(`${question.id} ne contient aucune bonne réponse.`)
  }
  if (new Set(question.answers).size !== question.answers.length) {
    throw new Error(`${question.id} contient deux fois le même indice de réponse.`)
  }
  if (!question.answers.every((answer) => Number.isInteger(answer) && answer >= 0 && answer < question.options.length)) {
    throw new Error(`${question.id} contient un indice de réponse invalide.`)
  }
  if (question.answers.some((answer, index) => index > 0 && question.answers[index - 1] >= answer)) {
    throw new Error(`${question.id} contient des indices de réponse non triés.`)
  }
  if (question.type === 'single' && question.answers.length !== 1) {
    throw new Error(`${question.id} est déclaré à réponse unique mais possède ${question.answers.length} réponses.`)
  }
  if (question.type === 'multiple' && question.answers.length < 2) {
    throw new Error(`${question.id} est déclaré à réponses multiples mais n’en possède pas au moins deux.`)
  }
  if (Array.isArray(question.optionExplanations) && question.optionExplanations.length > 0 && question.optionExplanations.length !== question.options.length) {
    throw new Error(`${question.id} contient des explications de propositions désalignées.`)
  }
}

function validateAnswerPositionBalance(allQuestions) {
  const groups = new Map()
  const multiplePatterns = new Set()
  let currentPosition = null
  let currentStreak = 0
  let longestStreak = 0

  allQuestions.forEach((question) => {
    if (question.answers.length === 1) {
      const key = `${question.subject}::${question.options.length}`
      const group = groups.get(key) || { subject: question.subject, optionCount: question.options.length, positions: Array(question.options.length).fill(0), total: 0 }
      group.positions[question.answers[0]] += 1
      group.total += 1
      groups.set(key, group)
      if (currentPosition === question.answers[0]) currentStreak += 1
      else {
        currentPosition = question.answers[0]
        currentStreak = 1
      }
      longestStreak = Math.max(longestStreak, currentStreak)
    } else {
      currentPosition = null
      currentStreak = 0
      multiplePatterns.add(`${question.options.length}:${question.answers.join('-')}`)
    }
  })

  for (const group of groups.values()) {
    if (group.total < group.optionCount) continue
    const maximum = Math.max(...group.positions)
    const minimum = Math.min(...group.positions)
    if (minimum === 0 || maximum - minimum > 1) {
      throw new Error(`Répartition déséquilibrée pour ${group.subject} (${group.optionCount} choix) : ${group.positions.join('/')}.`)
    }
  }
  if (longestStreak > 10) throw new Error(`Une série de ${longestStreak} réponses uniques consécutives occupe la même position.`)
  if (allQuestions.some((question) => question.answers.length > 1) && multiplePatterns.size < 3) {
    throw new Error('Les combinaisons de réponses multiples ne sont pas suffisamment variées.')
  }
  return { groups: [...groups.values()], multiplePatternCount: multiplePatterns.size, longestSingleAnswerPositionStreak: longestStreak }
}

const allQuestions = [...questions, ...legalReview]
console.log(`[LexQCM] Banque QCM publiée : ${questions.length} questions avec visa.`)
console.log(`[LexQCM] Revue juridique : ${legalReview.length} questions non publiées.`)
expectedSets.forEach((set) => console.log(`[LexQCM] ${set.subject} (${set.prefix}) : ${allQuestions.filter((q) => q.subject === set.subject && String(q.id).startsWith(set.prefix)).length} dans le socle.`))
console.log(`[LexQCM] Questions écartées pour motif éditorial : ${editorialReview.length}.`)
console.log(`[LexQCM] Dossiers progressifs : ${cases}.`)

if (meta.cleanQuestionBase !== true) throw new Error('La banque n’est pas marquée comme base QCM saine.')
if (meta.importedFromLegacy !== false) throw new Error('Une source QCM legacy est encore déclarée dans les métadonnées.')
if (meta.legalPublicationPolicy !== true) throw new Error('La politique de publication juridique n’est pas active.')
if (allQuestions.length !== expectedSourceTotal || Number(meta.sourceQuestionCount) !== expectedSourceTotal) {
  throw new Error(`Le socle doit contenir exactement ${expectedSourceTotal} questions, ${allQuestions.length} détectées.`)
}
if (questions.length !== Number(meta.questionCount) || legalReview.length !== Number(meta.legalReviewCount)) {
  throw new Error('Les métadonnées de publication et de revue juridique sont incohérentes.')
}
if (questions.length + legalReview.length !== expectedSourceTotal) throw new Error('Le partage banque active/revue juridique est incomplet.')
if (editorialReview.length !== 0 || Number(meta.editorialReviewCount) !== 0 || Number(quality.excludedCount) !== 0) {
  throw new Error('Des questions étrangères ou rejetées subsistent dans le socle propre.')
}
if (quality.keptCount !== expectedSourceTotal || quality.inputCount !== expectedSourceTotal) {
  throw new Error(`Le rapport éditorial ne correspond pas aux ${expectedSourceTotal} questions du socle.`)
}
if (Number(meta.optionOrderVersion) !== expectedOptionOrderVersion || Number(quality.optionOrderVersion) !== expectedOptionOrderVersion) {
  throw new Error(`La version de mélange des propositions publiées doit être ${expectedOptionOrderVersion}.`)
}
if (Number(authority.publishedQuestionCount) !== questions.length || Number(authority.quarantinedQuestionCount) !== legalReview.length || Number(authority.publishedCoverageRate) !== 100) {
  throw new Error('Le rapport des visas ne correspond pas à la banque juridiquement autonome.')
}
for (const set of expectedSets) {
  const matches = allQuestions.filter((q) => q.subject === set.subject && String(q.id).startsWith(set.prefix))
  if (matches.length !== set.count) throw new Error(`Lot ${set.subject} (${set.prefix}) invalide : ${matches.length}/${set.count} questions.`)
}
if (allQuestions.some((q) => !expectedSets.some((set) => q.subject === set.subject && String(q.id).startsWith(set.prefix)))) {
  throw new Error('Une question extérieure aux lots éditoriaux validés a été détectée.')
}
if (new Set(allQuestions.map((q) => q.id)).size !== expectedSourceTotal) throw new Error('Des identifiants QCM sont dupliqués.')
if (questions.some((question) => !hasLegalAuthority(question))) throw new Error('Une question publiée ne possède pas de visa juridique précis.')
if (questions.some((question) => !normalize(question.source?.label).startsWith('visa'))) throw new Error('Une source publiée ne présente pas le visa en premier.')
if (legalReview.some(hasLegalAuthority)) throw new Error('Une question déjà sourcée est restée par erreur dans la revue juridique.')
if (legalReview.some((question) => question.active !== false)) throw new Error('Une question en revue juridique est encore marquée active.')
allQuestions.forEach(validateQuestionInternals)
const answerPositionAudit = validateAnswerPositionBalance(questions)
console.log(`[LexQCM] Répartition des réponses publiées validée : ${JSON.stringify(answerPositionAudit.groups.map((group) => ({ subject: group.subject, choices: group.optionCount, positions: group.positions })))}.`)
console.log(`[LexQCM] ${answerPositionAudit.multiplePatternCount} combinaisons de réponses multiples ; série maximale identique : ${answerPositionAudit.longestSingleAnswerPositionStreak}.`)
const publishedPc = questions.filter((q) => q.subject === 'Procédure civile').length
const publishedPc25 = questions.filter((q) => q.id.startsWith('PC25-CORR-')).length
const publishedPc26 = questions.filter((q) => q.id.startsWith('PC26-CORR-')).length
if (Number(meta.procedureCivileCorrectionQuestionCount) !== publishedPc || Number(meta.procedureCivile2025QuestionCount) !== publishedPc25 || Number(meta.procedureCivile2026QuestionCount) !== publishedPc26) {
  throw new Error('Les métadonnées actives de procédure civile sont incohérentes.')
}
if (cases < 30) throw new Error(`Import incomplet des dossiers : seulement ${cases} détectés.`)
