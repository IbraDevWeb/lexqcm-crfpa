import fs from 'node:fs/promises'
import path from 'node:path'

const generatedDir = path.join(process.cwd(), 'public', 'generated')
const CONCEPT_VERSION = 1
const OFFICIAL_HOSTS = new Set([
  'www.legifrance.gouv.fr', 'legifrance.gouv.fr',
  'www.courdecassation.fr', 'courdecassation.fr',
  'www.conseil-etat.fr', 'conseil-etat.fr',
  'eur-lex.europa.eu', 'curia.europa.eu', 'hudoc.echr.coe.int',
])
const STOP_WORDS = new Set([
  'alors','ainsi','apres','avec','avoir','cette','comme','dans','doit','donc','elle','elles','entre','est','etre','fait','faut',
  'leur','leurs','mais','meme','pour','peut','plus','quand','quelle','quelles','quel','quels','selon','sera','sont','sous','tout',
  'toute','toutes','tous','une','des','les','aux','sur','par','pas','que','qui','quoi','dont','ces','ses','son','lorsque','comment',
  'pourquoi','corrige','reponse','demande','question','droit','regle','principe','conditions','condition','effet','effets','cas','juge',
])
const GENERIC = new Set(['oui','non','jamais','toujours','uniquement','aucune','aucun','possible','impossible'])

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'")
    .replace(/[^a-zA-Z0-9.'°/-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}
function words(value, minimum = 3) {
  return normalize(value).split(' ').filter((word) => word.length >= minimum && !STOP_WORDS.has(word))
}
function setOf(value, minimum = 3) { return new Set(words(value, minimum)) }
function containment(leftValue, rightValue) {
  const left = setOf(leftValue)
  const right = setOf(rightValue)
  if (!left.size || !right.size) return 0
  let common = 0
  left.forEach((word) => { if (right.has(word)) common += 1 })
  return common / Math.min(left.size, right.size)
}
function coverage(queryValue, documentValue) {
  const query = setOf(queryValue)
  const document = setOf(documentValue)
  if (!query.size || !document.size) return 0
  let common = 0
  query.forEach((word) => { if (document.has(word)) common += 1 })
  return common / query.size
}
function correctAnswerText(question) {
  return Array.isArray(question?.answers) && Array.isArray(question?.options)
    ? question.answers.map((index) => question.options[index]).filter(Boolean).join(' ')
    : ''
}
function meaningfulAnswer(question) {
  const value = correctAnswerText(question)
  const useful = words(value).filter((word) => !GENERIC.has(word))
  return useful.length >= 2 || (useful.length === 1 && useful[0].length >= 8) ? value : ''
}
function stripLegalBlock(value) {
  return String(value || '').replace(/\n\nFondement juridique\s*—[\s\S]*$/u, '').trim()
}
function parsePages(value) {
  const match = normalize(value).match(/\bp\.?\s*(\d{1,3})(?:\s*(?:a|à|au|[-–—])\s*(\d{1,3}))?\b/)
  if (!match) return null
  const a = Number(match[1]); const b = Number(match[2] || match[1])
  return { start: Math.min(a, b), end: Math.max(a, b) }
}
function parseSource(source) {
  const label = [source?.label, source?.pages].filter(Boolean).join(' ')
  const text = normalize(label)
  return {
    provider: text.includes('objectif barreau') ? 'objectif-barreau' : text.includes('pre-barreau') ? 'pre-barreau' : '',
    year: text.match(/\b20\d{2}\b/)?.[0] || '',
    number: text.match(/(?:epreuve|sujet|corrige)[^0-9]{0,24}(\d{1,2})/)?.[1] || '',
    pages: parsePages(label),
  }
}
function overlapPages(left, right) {
  return left && right && left.start <= right.end && right.start <= left.end ? 1 : 0
}
function cleanRef(value) { return String(value || '').replace(/\s+/g, ' ').replace(/^[,;:\s]+|[,;:\s]+$/g, '').trim() }
function isPreciseRef(value) {
  const text = normalize(value)
  return /\d/.test(text) && /\b(article|articles|art\.?|cpc|code|cass\.?|civ\.?|soc\.?|com\.?|crim\.?|ass\.? plen\.?|conseil d'etat|\bce\b|cjue|cedh|loi|decret|reglement|directive)\b/.test(text)
}
function legalRefs(values) {
  const seen = new Set(); const result = []
  for (const raw of Array.isArray(values) ? values : []) {
    const value = cleanRef(raw); const key = normalize(value)
    if (!value || value.length > 240 || seen.has(key) || !isPreciseRef(value)) continue
    seen.add(key); result.push(value)
  }
  return result
}
function official(value) {
  if (!value || typeof value.url !== 'string') return null
  try {
    const url = new URL(value.url)
    if (url.protocol !== 'https:' || !OFFICIAL_HOSTS.has(url.hostname)) return null
    return { status: value.status || 'officiel', label: value.label || 'Source officielle', url: url.toString() }
  } catch { return null }
}
function sameRefs(left, right) {
  if (!left || !right) return false
  const a = legalRefs(left.legalRefs).map(normalize).sort(); const b = legalRefs(right.legalRefs).map(normalize).sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}
function visibleEditorialLabel(source) {
  return String(source?.label || '').replace(/^Source éditoriale\s*:\s*/i, '').trim()
}

function candidatesFrom(cases) {
  const result = []
  for (const dossier of Array.isArray(cases) ? cases : []) {
    for (const question of Array.isArray(dossier.questions) ? dossier.questions : []) {
      const refs = legalRefs(question.legalRefs)
      if (!refs.length) continue
      const source = question.source || dossier.source || null
      const answer = meaningfulAnswer(question)
      const document = [dossier.topic, question.stem, question.explanation, question.reasoning, answer].filter(Boolean).join(' ')
      result.push({
        id: question.id,
        subject: dossier.subject || question.subject || '',
        topic: dossier.topic || question.topic || '',
        stem: question.stem || '',
        explanation: question.explanation || '',
        reasoning: question.reasoning || '',
        answer,
        document,
        source,
        sourceParts: parseSource(source),
        legalRefs: refs,
        verified: official(question.verified),
      })
    }
  }
  return result
}

function score(question, candidate) {
  if (normalize(question.subject) !== normalize(candidate.subject)) return null
  const qSource = parseSource(question.editorialSource || question.source)
  const cSource = candidate.sourceParts
  const provider = qSource.provider && cSource.provider && qSource.provider === cSource.provider ? 1 : 0
  const sameYear = qSource.year && cSource.year && qSource.year === cSource.year ? 1 : 0
  const sameNumber = qSource.number && cSource.number && qSource.number === cSource.number ? 1 : 0
  const pages = overlapPages(qSource.pages, cSource.pages)
  const topicPhrase = normalize(question.topic).length >= 6 && normalize(candidate.document).includes(normalize(question.topic)) ? 1 : 0
  const topic = coverage(question.topic, candidate.document)
  const answer = containment(meaningfulAnswer(question), candidate.answer)
  const stem = containment(question.stem, candidate.document)
  const explanation = containment(stripLegalBlock(question.explanation), candidate.document)
  const scoreValue = topic * 0.27 + answer * 0.18 + stem * 0.16 + explanation * 0.15 + pages * 0.10
    + sameNumber * 0.06 + provider * 0.04 + sameYear * 0.02 + topicPhrase * 0.02
  return { score: scoreValue, topic, answer, stem, explanation, pages, sameNumber, provider, sameYear, topicPhrase }
}

function findConceptMatch(question, candidates) {
  const ranked = candidates.map((candidate) => ({ candidate, metrics: score(question, candidate) }))
    .filter((entry) => entry.metrics).sort((a, b) => b.metrics.score - a.metrics.score)
  const best = ranked[0]; const second = ranked[1]
  if (!best) return null
  const margin = best.metrics.score - (second?.metrics.score || 0)
  const sharedRefs = sameRefs(best.candidate, second?.candidate)
  const sourceCoherent = best.metrics.provider === 1 && (best.metrics.sameYear === 1 || !parseSource(question.editorialSource || question.source).year)
  const conceptStrong = best.metrics.topicPhrase === 1 || best.metrics.topic >= 0.75
  const semanticStrong = best.metrics.answer >= 0.50 || best.metrics.stem >= 0.42 || best.metrics.explanation >= 0.42
  const contextualAnchor = best.metrics.pages === 1 || best.metrics.sameNumber === 1 || semanticStrong
  const exactConceptMatch = conceptStrong && contextualAnchor && best.metrics.score >= 0.36
  const sourceConceptMatch = sourceCoherent && conceptStrong && best.metrics.score >= 0.34
  const compositeMatch = best.metrics.score >= 0.46 && semanticStrong
  const distinct = margin >= 0.045 || sharedRefs || best.metrics.score >= 0.57
  if (!(exactConceptMatch || sourceConceptMatch || compositeMatch) || !distinct) return null
  return {
    ...best.candidate,
    method: exactConceptMatch ? 'case-concept-match' : sourceConceptMatch ? 'case-source-concept-match' : 'case-semantic-concept-match',
    confidence: Number(best.metrics.score.toFixed(3)),
    margin: Number(margin.toFixed(3)),
  }
}

function apply(question, match) {
  const editorialSource = question.editorialSource || question.source || null
  const editorialLabel = visibleEditorialLabel(editorialSource)
  const verification = official(question.verified) || match.verified || null
  const explanation = `${stripLegalBlock(question.explanation)}\n\nFondement juridique — ${match.legalRefs.join(' ; ')}.`
  return {
    ...question,
    explanation,
    legalRefs: match.legalRefs,
    legalAuthorityStatus: verification ? 'official-verified' : match.method,
    legalAuthorityConfidence: match.confidence,
    legalAuthorityMargin: match.margin,
    legalAuthorityOrigin: match.id,
    verified: verification,
    editorialSource,
    source: {
      ...(editorialSource || {}),
      label: `Visa : ${match.legalRefs.join(' ; ')}${editorialLabel ? ` · Source éditoriale : ${editorialLabel}` : ''}`,
      url: verification?.url,
      kind: verification ? 'official' : 'legal-authority',
      verified: verification ? 'official' : match.method,
    },
  }
}

function reportFor(questions) {
  const methods = {}; const bySubject = {}; const missing = []
  let sourcedCount = 0; let officiallyVerifiedCount = 0
  for (const question of questions) {
    const method = question.legalAuthorityStatus || 'missing'; methods[method] = (methods[method] || 0) + 1
    const subject = question.subject || 'Matière inconnue'
    bySubject[subject] ||= { total: 0, sourced: 0, official: 0, missing: 0 }
    bySubject[subject].total += 1
    if (legalRefs(question.legalRefs).length) { sourcedCount += 1; bySubject[subject].sourced += 1 }
    else {
      bySubject[subject].missing += 1
      missing.push({ id: question.id, subject, topic: question.topic, stem: question.stem, editorialSource: question.editorialSource?.label || '' })
    }
    if (official(question.verified)) { officiallyVerifiedCount += 1; bySubject[subject].official += 1 }
  }
  return {
    generatedAt: new Date().toISOString(),
    authorityVersion: 1,
    refinementVersion: 1,
    conceptExpansionVersion: CONCEPT_VERSION,
    questionCount: questions.length,
    sourcedCount,
    officiallyVerifiedCount,
    missingCount: questions.length - sourcedCount,
    coverageRate: questions.length ? Math.round((sourcedCount / questions.length) * 1000) / 10 : 0,
    methods, bySubject, missing,
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
  const paths = {
    questions: path.join(generatedDir, 'questions.json'), cases: path.join(generatedDir, 'cases.json'),
    meta: path.join(generatedDir, 'meta.json'), quality: path.join(generatedDir, 'quality-report.json'),
    report: path.join(generatedDir, 'legal-authority-report.json'),
  }
  const [questions, cases, meta, quality] = await Promise.all([
    fs.readFile(paths.questions, 'utf8').then(JSON.parse), fs.readFile(paths.cases, 'utf8').then(JSON.parse),
    fs.readFile(paths.meta, 'utf8').then(JSON.parse), fs.readFile(paths.quality, 'utf8').then(JSON.parse),
  ])
  const candidates = candidatesFrom(cases)
  let added = 0
  const expanded = questions.map((question) => {
    if (legalRefs(question.legalRefs).length) return question
    const match = findConceptMatch(question, candidates)
    if (!match) return question
    added += 1
    return apply(question, match)
  })
  const report = reportFor(expanded)
  if (expanded.some((question) => legalRefs(question.legalRefs).length !== (question.legalRefs || []).length)) throw new Error('Référence juridique imprécise après expansion conceptuelle.')
  await Promise.all([
    fs.writeFile(paths.questions, JSON.stringify(expanded)),
    fs.writeFile(paths.report, JSON.stringify(report, null, 2)),
    fs.writeFile(paths.meta, JSON.stringify({ ...meta, legalAuthorityConceptVersion: CONCEPT_VERSION, legalAuthorityQuestionCount: report.sourcedCount, legalAuthorityMissingCount: report.missingCount, legalAuthorityCoverageRate: report.coverageRate, officiallyVerifiedAuthorityCount: report.officiallyVerifiedCount }, null, 2)),
    fs.writeFile(paths.quality, JSON.stringify({ ...quality, legalAuthorities: report }, null, 2)),
  ])
  console.log(`[LexQCM] Expansion conceptuelle v${CONCEPT_VERSION} : ${added} visa(s) supplémentaire(s).`)
  console.log(`[LexQCM] Couverture juridique publiée : ${report.sourcedCount}/${report.questionCount} (${report.coverageRate} %), ${report.missingCount} à vérifier.`)
  Object.entries(report.bySubject).forEach(([subject, stats]) => console.log(`[LexQCM] ${subject} — visas ${stats.sourced}/${stats.total}, officiels ${stats.official}, manquants ${stats.missing}.`))
}

await main()
