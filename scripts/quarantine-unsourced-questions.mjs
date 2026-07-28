import fs from 'node:fs/promises'
import path from 'node:path'

const generatedDir = path.join(process.cwd(), 'public', 'generated')
const PUBLISHED_OPTION_ORDER_VERSION = 3
const TRUSTED_STATUSES = new Set([
  'existing',
  'source-explicit',
  'case-exact',
  'case-direct',
  'case-direct-official',
])

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ').trim().toLowerCase()
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
  return hasLegalAuthority(question) && TRUSTED_STATUSES.has(question.legalAuthorityStatus)
}

function stableHash(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function moveSingleAnswer(question, targetPosition) {
  if (!Array.isArray(question.answers) || question.answers.length !== 1) return question
  const currentPosition = question.answers[0]
  if (currentPosition === targetPosition) return question
  const options = [...question.options]
  ;[options[currentPosition], options[targetPosition]] = [options[targetPosition], options[currentPosition]]
  let optionExplanations = question.optionExplanations
  if (Array.isArray(question.optionExplanations) && question.optionExplanations.length === question.options.length) {
    optionExplanations = [...question.optionExplanations]
    ;[optionExplanations[currentPosition], optionExplanations[targetPosition]] = [optionExplanations[targetPosition], optionExplanations[currentPosition]]
  }
  return { ...question, options, answers: [targetPosition], optionExplanations }
}

function rebalanceSingleAnswers(questions) {
  const targets = new Map()
  const groups = new Map()
  questions.forEach((question) => {
    if (question.answers?.length !== 1) return
    const key = `${question.subject}::${question.options.length}`
    const group = groups.get(key) || []
    group.push(question)
    groups.set(key, group)
  })
  groups.forEach((group) => {
    group.slice().sort((left, right) => {
      const difference = stableHash(`published-v${PUBLISHED_OPTION_ORDER_VERSION}:${left.id}`) - stableHash(`published-v${PUBLISHED_OPTION_ORDER_VERSION}:${right.id}`)
      return difference || left.id.localeCompare(right.id, 'fr')
    }).forEach((question, index) => targets.set(question.id, index % question.options.length))
  })
  return questions.map((question) => Number.isInteger(targets.get(question.id)) ? moveSingleAnswer(question, targets.get(question.id)) : question)
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

function countsBySubject(questions) {
  return questions.reduce((counts, question) => {
    counts[question.subject] = (counts[question.subject] || 0) + 1
    return counts
  }, {})
}

async function main() {
  const paths = {
    questions: path.join(generatedDir, 'questions.json'),
    review: path.join(generatedDir, 'questions-legal-review.json'),
    meta: path.join(generatedDir, 'meta.json'),
    quality: path.join(generatedDir, 'quality-report.json'),
    authority: path.join(generatedDir, 'legal-authority-report.json'),
  }
  const [questions, meta, quality, authority] = await Promise.all([
    fs.readFile(paths.questions, 'utf8').then(JSON.parse),
    fs.readFile(paths.meta, 'utf8').then(JSON.parse),
    fs.readFile(paths.quality, 'utf8').then(JSON.parse),
    fs.readFile(paths.authority, 'utf8').then(JSON.parse),
  ])
  if (!Array.isArray(questions)) throw new Error('Banque QCM invalide avant quarantaine juridique.')

  const cleanQuestions = questions.filter((question) => question.catalogOrigin !== 'case-bank')
  const directCaseQuestions = questions.filter((question) => question.catalogOrigin === 'case-bank')
  const invalidDirect = directCaseQuestions.filter((question) => !isPublishableAuthority(question))
  if (invalidDirect.length) throw new Error(`${invalidDirect.length} QCM de dossier ne satisfont pas la politique de visa direct.`)

  const trustedCleanQuestions = cleanQuestions.filter(isPublishableAuthority)
  const published = rebalanceSingleAnswers([...trustedCleanQuestions, ...directCaseQuestions])
  const pending = cleanQuestions.filter((question) => !isPublishableAuthority(question)).map((question) => ({
    ...question,
    active: false,
    legalAuthorityStatus: question.legalAuthorityStatus || 'missing',
    proposedLegalRefs: Array.isArray(question.legalRefs) ? question.legalRefs : [],
    reviewReason: hasLegalAuthority(question)
      ? 'Visa proposé par rapprochement automatique entre deux énoncés distincts : validation manuelle requise.'
      : 'Visa juridique précis absent ou rapprochement insuffisamment certain.',
  }))

  const publishedIds = new Set(published.map((question) => question.id))
  const pendingIds = new Set(pending.map((question) => question.id))
  if (publishedIds.size !== published.length || pendingIds.size !== pending.length) throw new Error('Identifiants dupliqués pendant la quarantaine juridique.')
  if ([...publishedIds].some((id) => pendingIds.has(id))) throw new Error('Une question figure à la fois dans la banque active et dans la revue juridique.')
  if (trustedCleanQuestions.length + pending.length !== cleanQuestions.length) throw new Error('Des questions éditoriales ont été perdues pendant la quarantaine juridique.')
  if (published.some((question) => !isPublishableAuthority(question))) throw new Error('Une question au visa non fiable subsiste dans la banque publiée.')

  const activeBySubject = countsBySubject(published)
  const reviewBySubject = countsBySubject(pending)
  const directBySubject = countsBySubject(directCaseQuestions)
  const trustedCleanBySubject = countsBySubject(trustedCleanQuestions)
  const positionStats = answerPositionStats(published)
  const activeBySet = {
    'PC26-CORR-': trustedCleanQuestions.filter((question) => question.id.startsWith('PC26-CORR-')).length,
    'PC25-CORR-': trustedCleanQuestions.filter((question) => question.id.startsWith('PC25-CORR-')).length,
    'OB26-CORR-': trustedCleanQuestions.filter((question) => question.id.startsWith('OB26-CORR-')).length,
    'DS26-CORR-': trustedCleanQuestions.filter((question) => question.id.startsWith('DS26-CORR-')).length,
  }

  const legalPublication = {
    policy: 'Aucun QCM n’est publié sur la seule base d’un rapprochement sémantique ou documentaire avec un autre énoncé.',
    sourceQuestionCount: cleanQuestions.length,
    trustedCleanQuestionCount: trustedCleanQuestions.length,
    directCaseQuestionCount: directCaseQuestions.length,
    publishedQuestionCount: published.length,
    legalReviewCount: pending.length,
    publishedCoverageRate: published.length ? 100 : 0,
    trustedStatuses: [...TRUSTED_STATUSES],
    activeBySubject,
    reviewBySubject,
    directBySubject,
    trustedCleanBySubject,
    activeBySet,
  }

  await Promise.all([
    fs.writeFile(paths.questions, JSON.stringify(published)),
    fs.writeFile(paths.review, JSON.stringify(pending, null, 2)),
    fs.writeFile(paths.meta, JSON.stringify({
      ...meta,
      sourceQuestionCount: cleanQuestions.length,
      trustedCleanQuestionCount: trustedCleanQuestions.length,
      directCaseQuestionCount: directCaseQuestions.length,
      questionCount: published.length,
      legalReviewCount: pending.length,
      legalPublicationPolicy: true,
      trustedLegalAuthorityStatuses: [...TRUSTED_STATUSES],
      optionOrderVersion: PUBLISHED_OPTION_ORDER_VERSION,
      answerPositionStats: positionStats,
      questionsBySubject: activeBySubject,
      legalReviewBySubject: reviewBySubject,
      directCaseQuestionsBySubject: directBySubject,
      trustedCleanQuestionsBySubject: trustedCleanBySubject,
      procedureCivileCorrectionQuestionCount: trustedCleanBySubject['Procédure civile'] || 0,
      procedureCivile2026QuestionCount: activeBySet['PC26-CORR-'],
      procedureCivile2025QuestionCount: activeBySet['PC25-CORR-'],
      obligationsCorrectionQuestionCount: trustedCleanBySubject['Droit des obligations'] || 0,
      droitSocialCorrectionQuestionCount: trustedCleanBySubject['Droit social'] || 0,
    }, null, 2)),
    fs.writeFile(paths.quality, JSON.stringify({
      ...quality,
      publishedCount: published.length,
      legalReviewCount: pending.length,
      optionOrderVersion: PUBLISHED_OPTION_ORDER_VERSION,
      answerPositionStats: positionStats,
      legalPublication,
    }, null, 2)),
    fs.writeFile(paths.authority, JSON.stringify({
      ...authority,
      trustedCleanQuestionCount: trustedCleanQuestions.length,
      directCaseQuestionCount: directCaseQuestions.length,
      publishedQuestionCount: published.length,
      quarantinedQuestionCount: pending.length,
      publishedCoverageRate: published.length ? 100 : 0,
      trustedStatuses: [...TRUSTED_STATUSES],
      activeBySubject,
      reviewBySubject,
      directBySubject,
      trustedCleanBySubject,
      activeBySet,
    }, null, 2)),
  ])

  console.log(`[LexQCM] Banque juridiquement autonome : ${published.length} QCM publiés (${trustedCleanQuestions.length} issus directement de la banque éditoriale + ${directCaseQuestions.length} issus des dossiers).`)
  console.log(`[LexQCM] Revue juridique : ${pending.length}/${cleanQuestions.length} QCM éditoriaux conservés hors entraînement.`)
  Object.entries(activeBySubject).forEach(([subject, count]) => console.log(`[LexQCM] ${subject} — ${count} QCM publiés avec visa direct ou explicite.`))
  console.log(`[LexQCM] Réponses actives rééquilibrées en ordre v${PUBLISHED_OPTION_ORDER_VERSION} : ${JSON.stringify(positionStats.bySubject)}.`)
}

await main()
