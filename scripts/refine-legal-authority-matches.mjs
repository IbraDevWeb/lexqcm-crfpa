import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const generatedDir = path.join(root, 'public', 'generated')
const REFINEMENT_VERSION = 1
const OFFICIAL_HOSTS = new Set([
  'www.legifrance.gouv.fr',
  'legifrance.gouv.fr',
  'www.courdecassation.fr',
  'courdecassation.fr',
  'www.conseil-etat.fr',
  'conseil-etat.fr',
  'eur-lex.europa.eu',
  'curia.europa.eu',
  'hudoc.echr.coe.int',
])
const STOP_WORDS = new Set([
  'alors', 'ainsi', 'apres', 'avec', 'avoir', 'cette', 'comme', 'dans', 'doit', 'donc', 'elle', 'elles', 'entre',
  'est', 'etre', 'fait', 'faut', 'leur', 'leurs', 'mais', 'meme', 'pour', 'peut', 'plus', 'quand', 'quelle', 'quelles',
  'quel', 'quels', 'selon', 'sera', 'sont', 'sous', 'tout', 'toute', 'toutes', 'tous', 'une', 'des', 'les', 'aux', 'sur',
  'par', 'pas', 'que', 'qui', 'quoi', 'dont', 'ces', 'ses', 'son', 'lorsque', 'comment', 'pourquoi', 'corrige', 'reponse',
])
const GENERIC_ANSWER_TOKENS = new Set(['oui', 'non', 'jamais', 'toujours', 'uniquement', 'aucune', 'aucun'])

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[^a-zA-Z0-9.'°/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function tokenList(value) {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
}

function tokenSet(value) {
  return new Set(tokenList(value))
}

function jaccard(leftValue, rightValue) {
  const left = tokenSet(leftValue)
  const right = tokenSet(rightValue)
  if (!left.size || !right.size) return 0
  let intersection = 0
  left.forEach((token) => { if (right.has(token)) intersection += 1 })
  return intersection / (left.size + right.size - intersection)
}

function correctAnswerText(question) {
  if (!Array.isArray(question?.options) || !Array.isArray(question?.answers)) return ''
  return question.answers.map((index) => question.options[index]).filter(Boolean).join(' ')
}

function meaningfulAnswerText(question) {
  const answer = correctAnswerText(question)
  const meaningful = tokenList(answer).filter((token) => !GENERIC_ANSWER_TOKENS.has(token))
  return meaningful.length >= 2 || (meaningful.length === 1 && meaningful[0].length >= 8) ? answer : ''
}

function parsePages(value) {
  const text = normalize(value)
  const match = text.match(/\bp\.?\s*(\d{1,3})(?:\s*(?:a|à|au|[-–—])\s*(\d{1,3}))?\b/)
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2] || match[1])
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

function parseSource(source) {
  const label = [source?.label, source?.pages].filter(Boolean).join(' ')
  const text = normalize(label)
  const provider = text.includes('objectif barreau')
    ? 'objectif-barreau'
    : text.includes('pre-barreau')
      ? 'pre-barreau'
      : ''
  const year = text.match(/\b20\d{2}\b/)?.[0] || ''
  const number = text.match(/(?:epreuve|sujet|corrige)[^0-9]{0,24}(\d{1,2})/)?.[1] || ''
  const period = text.includes('pre-estiv')
    ? 'pre-estivale'
    : text.includes('supplement')
      ? 'supplementaire'
      : text.includes('estiv')
        ? 'estivale'
        : ''
  return { provider, year, number, period, pages: parsePages(label), label }
}

function pageOverlap(left, right) {
  if (!left || !right) return 0
  return left.start <= right.end && right.start <= left.end ? 1 : 0
}

function cleanReference(value) {
  return String(value || '').replace(/\s+/g, ' ').replace(/^[,;:\s]+|[,;:\s]+$/g, '').trim()
}

function isPreciseLegalReference(value) {
  const text = normalize(value)
  if (!/\d/.test(text)) return false
  return /\b(article|articles|art\.?|cpc|code|cass\.?|civ\.?|soc\.?|com\.?|crim\.?|ass\.? plen\.?|conseil d'etat|\bce\b|cjue|cedh|loi|decret|reglement|directive)\b/.test(text)
}

function uniquePreciseReferences(values) {
  const seen = new Set()
  const result = []
  for (const raw of Array.isArray(values) ? values : []) {
    const value = cleanReference(raw)
    const key = normalize(value)
    if (!value || value.length > 240 || seen.has(key) || !isPreciseLegalReference(value)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function officialVerification(value) {
  if (!value || typeof value !== 'object' || typeof value.url !== 'string') return null
  try {
    const url = new URL(value.url)
    if (url.protocol !== 'https:' || !OFFICIAL_HOSTS.has(url.hostname)) return null
    return { status: value.status || 'officiel', label: value.label || 'Source officielle', url: url.toString() }
  } catch {
    return null
  }
}

function sameReferences(left, right) {
  if (!left || !right) return false
  const first = uniquePreciseReferences(left.legalRefs).map(normalize).sort()
  const second = uniquePreciseReferences(right.legalRefs).map(normalize).sort()
  return first.length === second.length && first.every((value, index) => value === second[index])
}

function stripGeneratedLegalBlock(explanation) {
  return String(explanation || '').replace(/\n\nFondement juridique\s*—[\s\S]*$/u, '').trim()
}

function sourceLabel(source) {
  return String(source?.label || '').replace(/^Source éditoriale\s*:\s*/i, '').trim()
}

function flattenCaseQuestions(cases) {
  const result = []
  for (const dossier of Array.isArray(cases) ? cases : []) {
    for (const question of Array.isArray(dossier.questions) ? dossier.questions : []) {
      const legalRefs = uniquePreciseReferences(question.legalRefs)
      if (!legalRefs.length) continue
      const source = question.source || dossier.source || null
      result.push({
        id: question.id,
        subject: dossier.subject || question.subject || '',
        topic: dossier.topic || question.topic || '',
        stem: question.stem || '',
        explanation: question.explanation || '',
        options: question.options || [],
        answers: question.answers || [],
        source,
        parsedSource: parseSource(source),
        legalRefs,
        verified: officialVerification(question.verified),
      })
    }
  }
  return result
}

function scoreMatch(question, candidate) {
  if (normalize(question.subject) !== normalize(candidate.subject)) return null
  const questionSource = parseSource(question.editorialSource || question.source)
  const candidateSource = candidate.parsedSource
  const provider = questionSource.provider && candidateSource.provider && questionSource.provider === candidateSource.provider ? 1 : 0
  const year = questionSource.year && candidateSource.year && questionSource.year === candidateSource.year ? 1 : 0
  const number = questionSource.number && candidateSource.number && questionSource.number === candidateSource.number ? 1 : 0
  const period = questionSource.period && candidateSource.period && questionSource.period === candidateSource.period ? 1 : 0
  const pages = pageOverlap(questionSource.pages, candidateSource.pages)
  const stem = jaccard(question.stem, candidate.stem)
  const explanation = jaccard(stripGeneratedLegalBlock(question.explanation), candidate.explanation)
  const answer = jaccard(meaningfulAnswerText(question), meaningfulAnswerText(candidate))
  const topic = jaccard(question.topic, candidate.topic)
  const score = (pages * 0.20) + (number * 0.13) + (period * 0.05) + (provider * 0.05) + (year * 0.03)
    + (answer * 0.22) + (stem * 0.16) + (explanation * 0.11) + (topic * 0.05)
  return { score, provider, year, number, period, pages, stem, explanation, answer, topic }
}

function findMatch(question, candidates) {
  const ranked = candidates
    .map((candidate) => ({ candidate, metrics: scoreMatch(question, candidate) }))
    .filter((entry) => entry.metrics)
    .sort((left, right) => right.metrics.score - left.metrics.score)
  const best = ranked[0]
  const second = ranked[1]
  if (!best) return null

  const margin = best.metrics.score - (second?.metrics.score || 0)
  const sameRefs = sameReferences(best.candidate, second?.candidate)
  const sourceCoherent = best.metrics.provider === 1 && best.metrics.year === 1
  const semanticSignal = best.metrics.answer >= 0.20
    || best.metrics.stem >= 0.12
    || best.metrics.explanation >= 0.12
    || best.metrics.topic >= 0.34
  const strongPageMatch = sourceCoherent && best.metrics.pages === 1 && semanticSignal && best.metrics.score >= 0.31
  const sameExamMatch = sourceCoherent && best.metrics.number === 1 && semanticSignal && best.metrics.score >= 0.27
  const strongSemanticMatch = best.metrics.answer >= 0.45
    && (best.metrics.stem >= 0.08 || best.metrics.explanation >= 0.10 || best.metrics.topic >= 0.25)
    && best.metrics.score >= 0.24
  const highCompositeMatch = sourceCoherent && best.metrics.score >= 0.39 && semanticSignal
  const sufficientlyDistinct = margin >= 0.035 || sameRefs || best.metrics.score >= 0.50

  if (!(strongPageMatch || sameExamMatch || strongSemanticMatch || highCompositeMatch) || !sufficientlyDistinct) return null
  const method = strongPageMatch
    ? 'case-page-match'
    : sameExamMatch
      ? 'case-exam-match'
      : strongSemanticMatch
        ? 'case-answer-match'
        : 'case-composite-match'
  return {
    ...best.candidate,
    method,
    confidence: Number(best.metrics.score.toFixed(3)),
    margin: Number(margin.toFixed(3)),
  }
}

function applyMatch(question, match) {
  const editorialSource = question.editorialSource || question.source || null
  const editorialLabel = sourceLabel(editorialSource)
  const verified = officialVerification(question.verified) || match.verified || null
  const baseExplanation = stripGeneratedLegalBlock(question.explanation)
  const legalText = `Fondement juridique — ${match.legalRefs.join(' ; ')}.`
  return {
    ...question,
    explanation: `${baseExplanation}\n\n${legalText}`,
    legalRefs: match.legalRefs,
    legalAuthorityStatus: verified ? 'official-verified' : match.method,
    legalAuthorityConfidence: match.confidence,
    legalAuthorityMargin: match.margin,
    legalAuthorityOrigin: match.id,
    verified,
    editorialSource,
    source: {
      ...(editorialSource || {}),
      label: `Visa : ${match.legalRefs.join(' ; ')}${editorialLabel ? ` · Source éditoriale : ${editorialLabel}` : ''}`,
      url: verified?.url,
      kind: verified ? 'official' : 'legal-authority',
      verified: verified ? 'official' : match.method,
    },
  }
}

function buildReport(questions) {
  const methods = {}
  const bySubject = {}
  const missing = []
  let sourcedCount = 0
  let officiallyVerifiedCount = 0

  questions.forEach((question) => {
    const method = question.legalAuthorityStatus || 'missing'
    methods[method] = (methods[method] || 0) + 1
    const subject = question.subject || 'Matière inconnue'
    bySubject[subject] ||= { total: 0, sourced: 0, official: 0, missing: 0 }
    bySubject[subject].total += 1
    if (uniquePreciseReferences(question.legalRefs).length) {
      sourcedCount += 1
      bySubject[subject].sourced += 1
    } else {
      bySubject[subject].missing += 1
      missing.push({
        id: question.id,
        subject,
        topic: question.topic,
        stem: question.stem,
        editorialSource: question.editorialSource?.label || '',
      })
    }
    if (officialVerification(question.verified)) {
      officiallyVerifiedCount += 1
      bySubject[subject].official += 1
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    authorityVersion: Number(questions[0]?.legalAuthorityVersion || 1),
    refinementVersion: REFINEMENT_VERSION,
    questionCount: questions.length,
    sourcedCount,
    officiallyVerifiedCount,
    missingCount: questions.length - sourcedCount,
    coverageRate: questions.length ? Math.round((sourcedCount / questions.length) * 1000) / 10 : 0,
    methods,
    bySubject,
    missing,
    policy: {
      editorialSourceIsNotLegalAuthority: true,
      ambiguousMatchesAreRejected: true,
      noInferredCitation: true,
      acceptedAuthorities: 'Référence précise contenant un article, un texte numéroté ou une décision datée.',
      officialLinks: [...OFFICIAL_HOSTS],
    },
  }
}

async function main() {
  const questionsPath = path.join(generatedDir, 'questions.json')
  const casesPath = path.join(generatedDir, 'cases.json')
  const metaPath = path.join(generatedDir, 'meta.json')
  const qualityPath = path.join(generatedDir, 'quality-report.json')
  const [questions, cases, meta, quality] = await Promise.all([
    fs.readFile(questionsPath, 'utf8').then(JSON.parse),
    fs.readFile(casesPath, 'utf8').then(JSON.parse),
    fs.readFile(metaPath, 'utf8').then(JSON.parse),
    fs.readFile(qualityPath, 'utf8').then(JSON.parse),
  ])
  if (!Array.isArray(questions) || !Array.isArray(cases)) throw new Error('Banque générée invalide pour le rapprochement juridique.')

  const candidates = flattenCaseQuestions(cases)
  let refinedCount = 0
  const refined = questions.map((question) => {
    if (uniquePreciseReferences(question.legalRefs).length) return question
    const match = findMatch(question, candidates)
    if (!match) return question
    refinedCount += 1
    return applyMatch(question, match)
  })
  const report = buildReport(refined)

  if (refined.some((question) => uniquePreciseReferences(question.legalRefs).length !== (question.legalRefs || []).length)) {
    throw new Error('Une référence juridique imprécise a été conservée après rapprochement.')
  }
  if (refined.some((question) => question.verified?.url && !officialVerification(question.verified))) {
    throw new Error('Une URL non officielle est présentée comme source officielle.')
  }

  await Promise.all([
    fs.writeFile(questionsPath, JSON.stringify(refined)),
    fs.writeFile(path.join(generatedDir, 'legal-authority-report.json'), JSON.stringify(report, null, 2)),
    fs.writeFile(metaPath, JSON.stringify({
      ...meta,
      legalAuthorityRefinementVersion: REFINEMENT_VERSION,
      legalAuthorityQuestionCount: report.sourcedCount,
      legalAuthorityMissingCount: report.missingCount,
      legalAuthorityCoverageRate: report.coverageRate,
      officiallyVerifiedAuthorityCount: report.officiallyVerifiedCount,
    }, null, 2)),
    fs.writeFile(qualityPath, JSON.stringify({ ...quality, legalAuthorities: report }, null, 2)),
  ])

  console.log(`[LexQCM] Rapprochement juridique v${REFINEMENT_VERSION} : ${refinedCount} visa(s) supplémentaire(s).`)
  console.log(`[LexQCM] Couverture finale : ${report.sourcedCount}/${report.questionCount} questions (${report.coverageRate} %), ${report.missingCount} à vérifier manuellement.`)
  Object.entries(report.bySubject).forEach(([subject, stats]) => {
    console.log(`[LexQCM] ${subject} — visas ${stats.sourced}/${stats.total}, officiels ${stats.official}, manquants ${stats.missing}.`)
  })
}

await main()
