import fs from 'node:fs/promises'

const meta = JSON.parse(await fs.readFile('public/generated/meta.json', 'utf8'))
const questions = JSON.parse(await fs.readFile('public/generated/questions.json', 'utf8'))
const legalReview = JSON.parse(await fs.readFile('public/generated/questions-legal-review.json', 'utf8'))
const authority = JSON.parse(await fs.readFile('public/generated/legal-authority-report.json', 'utf8'))
const quality = JSON.parse(await fs.readFile('public/generated/quality-report.json', 'utf8'))
const editorialReview = JSON.parse(await fs.readFile('public/generated/questions-editorial-review.json', 'utf8'))

const expectedSourceTotal = 900
const expectedIejTotal = 360
const expectedOptionOrderVersion = 3
const expectedSets = [
  { subject: 'Procédure civile', prefix: 'PC26-CORR-', count: 120 },
  { subject: 'Procédure civile', prefix: 'PC25-CORR-', count: 180 },
  { subject: 'Droit des obligations', prefix: 'OB26-CORR-', count: 120 },
  { subject: 'Droit social', prefix: 'DS26-CORR-', count: 120 },
  { subject: 'Procédure civile', prefix: 'IEJ26-PC-', count: 120 },
  { subject: 'Droit des obligations', prefix: 'IEJ26-OB-', count: 120 },
  { subject: 'Droit social', prefix: 'IEJ26-DS-', count: 120 },
]
const trustedStatuses = new Set(Array.isArray(meta.trustedLegalAuthorityStatuses) ? meta.trustedLegalAuthorityStatuses : [])

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

function isPublishableAuthority(question) {
  return hasLegalAuthority(question) && trustedStatuses.has(question.legalAuthorityStatus)
}

function validateQuestion(question) {
  if (!question || typeof question.id !== 'string' || typeof question.subject !== 'string' || typeof question.topic !== 'string' || typeof question.stem !== 'string') {
    throw new Error('Une question publiée ou en revue ne possède pas les champs textuels requis.')
  }
  if (!Array.isArray(question.options) || question.options.length < 2 || question.options.some((option) => typeof option !== 'string' || !option.trim())) {
    throw new Error(`${question.id} contient des propositions invalides.`)
  }
  if (new Set(question.options.map(normalize)).size !== question.options.length) throw new Error(`${question.id} contient des propositions dupliquées.`)
  if (!Array.isArray(question.answers) || !question.answers.length || new Set(question.answers).size !== question.answers.length) throw new Error(`${question.id} contient des réponses invalides.`)
  if (!question.answers.every((answer) => Number.isInteger(answer) && answer >= 0 && answer < question.options.length)) throw new Error(`${question.id} contient un indice de réponse hors limites.`)
  if (question.answers.some((answer, index) => index > 0 && question.answers[index - 1] >= answer)) throw new Error(`${question.id} contient des indices de réponse non triés.`)
  if (question.type === 'single' && question.answers.length !== 1) throw new Error(`${question.id} est déclaré à réponse unique mais possède plusieurs réponses.`)
  if (question.type === 'multiple' && question.answers.length < 2) throw new Error(`${question.id} est déclaré à réponses multiples mais n’en possède pas assez.`)
  if (Array.isArray(question.optionExplanations) && question.optionExplanations.length && question.optionExplanations.length !== question.options.length) {
    throw new Error(`${question.id} contient des explications de propositions désalignées.`)
  }
}

function validateAnswerBalance(published) {
  const groups = new Map()
  const multiplePatterns = new Set()
  let currentPosition = null
  let currentStreak = 0
  let longestStreak = 0

  published.forEach((question) => {
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
  if (published.some((question) => question.answers.length > 1) && multiplePatterns.size < 3) throw new Error('Les combinaisons de réponses multiples ne sont pas assez variées.')
  return { groups: [...groups.values()], multiplePatternCount: multiplePatterns.size, longestStreak }
}

if (!Array.isArray(questions) || !Array.isArray(legalReview) || !Array.isArray(editorialReview)) throw new Error('Un fichier de banque générée ne contient pas un tableau.')
if (meta.cleanQuestionBase !== true || meta.importedFromLegacy !== false) throw new Error('La banque n’est pas déclarée comme socle propre.')
if (meta.legalPublicationPolicy !== true) throw new Error('La politique de publication juridiquement autonome n’est pas active.')
if (!trustedStatuses.has('source-explicit') || !trustedStatuses.has('case-direct')) throw new Error('Les statuts de sourcing fiables sont incomplets.')

const cleanPublished = questions.filter((question) => question.catalogOrigin !== 'case-bank')
const directPublished = questions.filter((question) => question.catalogOrigin === 'case-bank')
const cleanSocle = [...cleanPublished, ...legalReview]
const completeCatalog = [...questions, ...legalReview]
const iejPublished = questions.filter((question) => String(question.id).startsWith('IEJ26-'))

if (cleanSocle.length !== expectedSourceTotal || Number(meta.sourceQuestionCount) !== expectedSourceTotal) {
  throw new Error(`Le socle éditorial doit contenir ${expectedSourceTotal} QCM, ${cleanSocle.length} détectés.`)
}
if (iejPublished.length !== expectedIejTotal || Number(meta.iejSorbonne2026QuestionCount) !== expectedIejTotal) {
  throw new Error(`Le lot IEJ Sorbonne doit contenir ${expectedIejTotal} QCM publiés, ${iejPublished.length} détectés.`)
}
if (questions.length !== Number(meta.questionCount) || legalReview.length !== Number(meta.legalReviewCount)) throw new Error('Les métadonnées de publication sont incohérentes.')
if (cleanPublished.length !== Number(meta.trustedCleanQuestionCount) || directPublished.length !== Number(meta.directCaseQuestionCount)) throw new Error('Les métadonnées d’origine de la banque active sont incohérentes.')
if (editorialReview.length !== 0 || Number(meta.editorialReviewCount) !== 0 || Number(quality.excludedCount) !== 0) throw new Error('Des QCM ont été écartés par le contrôle éditorial.')
if (Number(quality.inputCount) !== expectedSourceTotal || Number(quality.keptCount) !== expectedSourceTotal) throw new Error('Le rapport qualité ne couvre pas les 900 QCM du socle.')
if (Number(meta.optionOrderVersion) !== expectedOptionOrderVersion || Number(quality.optionOrderVersion) !== expectedOptionOrderVersion) throw new Error('La version finale de répartition des réponses est incorrecte.')
if (Number(authority.publishedQuestionCount) !== questions.length || Number(authority.quarantinedQuestionCount) !== legalReview.length || Number(authority.publishedCoverageRate) !== 100) {
  throw new Error('Le rapport des visas ne correspond pas à la banque publiée.')
}

for (const set of expectedSets) {
  const matches = cleanSocle.filter((question) => question.subject === set.subject && String(question.id).startsWith(set.prefix))
  if (matches.length !== set.count) throw new Error(`Lot ${set.prefix} incomplet : ${matches.length}/${set.count}.`)
}
if (cleanSocle.some((question) => !expectedSets.some((set) => question.subject === set.subject && String(question.id).startsWith(set.prefix)))) {
  throw new Error('Une question extérieure aux sept lots éditoriaux autorisés a été détectée.')
}
if (new Set(completeCatalog.map((question) => question.id)).size !== completeCatalog.length) throw new Error('Des identifiants QCM sont dupliqués.')
completeCatalog.forEach(validateQuestion)

if (questions.some((question) => !isPublishableAuthority(question))) throw new Error('Une question publiée ne possède pas un visa juridiquement fiable.')
if (questions.some((question) => !normalize(question.source?.label).startsWith('visa'))) throw new Error('Une question publiée ne présente pas son visa en premier.')
if (legalReview.some(isPublishableAuthority)) throw new Error('Une question publiable est restée dans la revue juridique.')
if (legalReview.some((question) => question.active !== false)) throw new Error('Une question en revue juridique est encore active.')
if (iejPublished.some((question) => question.legalAuthorityStatus !== 'source-explicit')) throw new Error('Un QCM IEJ n’est pas rattaché directement à son autorité explicite.')
if (iejPublished.some((question) => !question.editorialSource?.label?.includes('IEJ de la Sorbonne 2026') || !question.editorialSource?.label?.includes('PDF p.'))) {
  throw new Error('Un QCM IEJ ne comporte pas la référence du fascicule et sa page PDF.')
}
if (iejPublished.some((question) => !question.tags?.includes('fascicule-2026') || !question.explanation?.includes('Fondement juridique'))) {
  throw new Error('Un QCM IEJ ne comporte pas les marqueurs de sourcing attendus.')
}

const answerAudit = validateAnswerBalance(questions)
if (Number(meta.caseCount || 0) < 30) throw new Error('Le catalogue des dossiers progressifs est incomplet.')

console.log(`[LexQCM] Socle éditorial validé : ${cleanSocle.length} QCM, dont ${iejPublished.length} nouveaux QCM IEJ Sorbonne 2026.`)
console.log(`[LexQCM] Banque active : ${questions.length} QCM juridiquement sourcés (${cleanPublished.length} éditoriaux + ${directPublished.length} issus des dossiers).`)
console.log(`[LexQCM] Revue juridique : ${legalReview.length} QCM conservés hors entraînement.`)
expectedSets.forEach((set) => console.log(`[LexQCM] ${set.prefix} — ${set.count} QCM présents.`))
console.log(`[LexQCM] Répartition des réponses validée : ${JSON.stringify(answerAudit.groups.map((group) => ({ subject: group.subject, choices: group.optionCount, positions: group.positions })))}.`)
console.log(`[LexQCM] QRM : ${answerAudit.multiplePatternCount} combinaisons ; série maximale de réponses uniques identiques : ${answerAudit.longestStreak}.`)
