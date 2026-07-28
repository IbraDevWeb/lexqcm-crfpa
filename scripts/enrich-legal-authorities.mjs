import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const generatedDir = path.join(root, 'public', 'generated')
const AUTHORITY_VERSION = 1
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
  'par', 'pas', 'que', 'qui', 'quoi', 'dont', 'ces', 'ses', 'son', 'dans', 'lorsque', 'comment', 'pourquoi', 'corrige',
])

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

function tokenSet(value) {
  return new Set(normalize(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)))
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

function sourceDescriptor(source) {
  const text = normalize(source?.label || '')
  const provider = text.includes('objectif barreau') ? 'objectif-barreau' : text.includes('pre-barreau') ? 'pre-barreau' : ''
  const year = text.match(/\b20\d{2}\b/)?.[0] || ''
  const number = text.match(/(?:epreuve|sujet|corrige)[^0-9]{0,20}(\d{1,2})/)?.[1] || ''
  const period = text.includes('pre-estiv') ? 'pre-estivale' : text.includes('supplement') ? 'supplementaire' : text.includes('estiv') ? 'estivale' : ''
  return { provider, year, number, period }
}

function sourceAffinity(leftSource, rightSource) {
  const left = sourceDescriptor(leftSource)
  const right = sourceDescriptor(rightSource)
  let compared = 0
  let matching = 0
  for (const key of ['provider', 'year', 'number', 'period']) {
    if (!left[key] || !right[key]) continue
    compared += 1
    if (left[key] === right[key]) matching += 1
  }
  return compared ? matching / compared : 0
}

function cleanReference(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[,;:\s]+|[,;:\s]+$/g, '')
    .trim()
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

const MONTH = '(?:janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre|janv\\.?|fevr\\.?|févr\\.?|avr\\.?|juill\\.?|sept\\.?|oct\\.?|nov\\.?|dec\\.?|déc\\.?)'
const EXPLICIT_PATTERNS = [
  new RegExp('\\b(?:articles?|art\\.)\\s+(?:[LRD]\\s*\\.?\\s*)?\\d+(?:[-.]\\d+)*(?:\\s*(?:,|et|a|à)\\s*(?:[LRD]\\s*\\.?\\s*)?\\d+(?:[-.]\\d+)*)*(?:\\s+(?:du|de la|de l[’\']?)\\s+(?:code[^.;,]{0,55}|CPC))?', 'gi'),
  new RegExp('\\b(?:CPC|C\\.\\s*civ\\.|C\\.\\s*trav\\.|C\\.\\s*com\\.|C\\.\\s*consom\\.|Code civil|Code de procédure civile|Code du travail|Code de commerce|Code de la consommation|Code des assurances)\\s*,?\\s*(?:articles?|art\\.)?\\s*(?:[LRD]\\s*\\.?\\s*)?\\d+(?:[-.]\\d+)*(?:\\s*(?:,|et|a|à)\\s*(?:[LRD]\\s*\\.?\\s*)?\\d+(?:[-.]\\d+)*)*', 'gi'),
  new RegExp('\\b(?:Cass\\.?(?:\\s*(?:ass\\.?\\s*plen\\.?|civ\\.?\\s*[123](?:re|e)?|soc\\.?|com\\.?|crim\\.?))?|Ass\\.?\\s*plen\\.?|Civ\\.?\\s*[123](?:re|e)?|Soc\\.?|Com\\.?|Crim\\.?|CE|CJUE|CEDH)[^.;\\n]{0,100}?\\b\\d{1,2}\\s+' + MONTH + '\\s+\\d{4}(?:[^.;\\n]{0,55}?(?:n[°o]|pourvoi)\\s*[A-Z0-9./-]+)?', 'gi'),
  new RegExp('\\b(?:loi|decret|décret|reglement|règlement|directive)\\s+(?:n[°o]\\s*[A-Z0-9./-]+\\s+)?du\\s+\\d{1,2}\\s+' + MONTH + '\\s+\\d{4}', 'gi'),
]

function extractExplicitReferences(question) {
  const text = [question.explanation, question.stem, question.source?.label].filter(Boolean).join(' — ')
  const references = []
  EXPLICIT_PATTERNS.forEach((pattern) => {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) references.push(match[0])
  })
  return uniquePreciseReferences(references)
}

function officialVerification(value) {
  if (!value || typeof value !== 'object' || typeof value.url !== 'string') return null
  try {
    const url = new URL(value.url)
    if (url.protocol !== 'https:' || !OFFICIAL_HOSTS.has(url.hostname)) return null
    return {
      status: value.status || 'officiel',
      label: value.label || 'Source officielle',
      url: url.toString(),
    }
  } catch {
    return null
  }
}

function flattenCaseQuestions(cases) {
  const result = []
  for (const dossier of Array.isArray(cases) ? cases : []) {
    for (const question of Array.isArray(dossier.questions) ? dossier.questions : []) {
      const legalRefs = uniquePreciseReferences(question.legalRefs)
      if (!legalRefs.length) continue
      result.push({
        id: question.id,
        subject: dossier.subject || question.subject || '',
        topic: dossier.topic || question.topic || '',
        stem: question.stem || '',
        explanation: question.explanation || '',
        options: question.options || [],
        answers: question.answers || [],
        source: question.source || dossier.source || null,
        legalRefs,
        verified: officialVerification(question.verified),
      })
    }
  }
  return result
}

function matchScore(question, candidate) {
  if (normalize(question.subject) !== normalize(candidate.subject)) return null
  const stem = jaccard(question.stem, candidate.stem)
  const explanation = jaccard(question.explanation, candidate.explanation)
  const answer = jaccard(correctAnswerText(question), correctAnswerText(candidate))
  const topic = jaccard(question.topic, candidate.topic)
  const source = sourceAffinity(question.source, candidate.source)
  const exactStem = normalize(question.stem) === normalize(candidate.stem)
  const exactExplanation = normalize(question.explanation) === normalize(candidate.explanation)
  const score = (stem * 0.42) + (explanation * 0.24) + (answer * 0.14) + (topic * 0.08) + (source * 0.12)
  return { score, stem, explanation, answer, topic, source, exactStem, exactExplanation }
}

function findCaseMatch(question, candidates) {
  const ranked = candidates
    .map((candidate) => ({ candidate, metrics: matchScore(question, candidate) }))
    .filter((entry) => entry.metrics)
    .sort((left, right) => right.metrics.score - left.metrics.score)
  const best = ranked[0]
  const second = ranked[1]
  if (!best) return null
  const margin = best.metrics.score - (second?.metrics.score || 0)
  const exact = best.metrics.exactStem || best.metrics.exactExplanation
  const sourceBound = best.metrics.source >= 0.75
    && best.metrics.stem >= 0.30
    && (best.metrics.explanation >= 0.25 || best.metrics.answer >= 0.35)
    && best.metrics.score >= 0.53
    && margin >= 0.045
  const semantic = best.metrics.score >= 0.72 && margin >= 0.09 && best.metrics.stem >= 0.48
  if (!exact && !sourceBound && !semantic) return null
  return {
    ...best.candidate,
    confidence: Number(best.metrics.score.toFixed(3)),
    method: exact ? 'case-exact' : sourceBound ? 'case-source-match' : 'case-semantic-match',
  }
}

function stripGeneratedLegalBlock(explanation) {
  return String(explanation || '').replace(/\n\nFondement juridique\s*—[\s\S]*$/u, '').trim()
}

function editorialSourceLabel(source) {
  return String(source?.label || '').replace(/^Source éditoriale\s*:\s*/i, '').trim()
}

function enrichQuestion(question, caseCandidates) {
  const existing = uniquePreciseReferences(question.legalRefs)
  const explicit = extractExplicitReferences(question)
  const matched = existing.length || explicit.length ? null : findCaseMatch(question, caseCandidates)
  const legalRefs = existing.length ? existing : explicit.length ? explicit : matched?.legalRefs || []
  const verified = officialVerification(question.verified) || matched?.verified || null
  const method = existing.length ? 'existing' : explicit.length ? 'source-explicit' : matched?.method || 'missing'
  const baseExplanation = stripGeneratedLegalBlock(question.explanation)
  const legalText = legalRefs.length
    ? `Fondement juridique — ${legalRefs.join(' ; ')}.`
    : 'Fondement juridique — visa précis en cours de vérification ; la source éditoriale seule ne vaut pas fondement autonome.'
  const originalSource = question.editorialSource || question.source || null
  const editorialLabel = editorialSourceLabel(originalSource)
  const combinedLabel = legalRefs.length
    ? `Visa : ${legalRefs.join(' ; ')}${editorialLabel ? ` · Source éditoriale : ${editorialLabel}` : ''}`
    : `${editorialLabel ? `Source éditoriale : ${editorialLabel} · ` : ''}Visa juridique à compléter`

  return {
    ...question,
    explanation: `${baseExplanation}\n\n${legalText}`,
    legalRefs,
    legalAuthorityStatus: verified ? 'official-verified' : legalRefs.length ? method : 'missing',
    legalAuthorityConfidence: matched?.confidence,
    legalAuthorityOrigin: matched?.id,
    verified,
    editorialSource: originalSource,
    source: {
      ...(originalSource || {}),
      label: combinedLabel,
      url: verified?.url,
      kind: verified ? 'official' : legalRefs.length ? 'legal-authority' : 'editorial-only',
      verified: verified ? 'official' : legalRefs.length ? method : 'missing',
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
    if (question.legalRefs?.length) {
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
    if (question.verified?.url) {
      officiallyVerifiedCount += 1
      bySubject[subject].official += 1
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    authorityVersion: AUTHORITY_VERSION,
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
  if (!Array.isArray(questions) || !Array.isArray(cases)) throw new Error('Banque générée invalide pour l’enrichissement juridique.')

  const candidates = flattenCaseQuestions(cases)
  const enriched = questions.map((question) => enrichQuestion(question, candidates))
  const report = buildReport(enriched)

  if (enriched.some((question) => !Array.isArray(question.legalRefs) || question.legalRefs.some((ref) => !isPreciseLegalReference(ref)))) {
    throw new Error('Une référence juridique imprécise ou invalide a été publiée.')
  }
  if (enriched.some((question) => question.verified?.url && !officialVerification(question.verified))) {
    throw new Error('Une URL présentée comme officielle ne figure pas dans la liste blanche.')
  }

  await Promise.all([
    fs.writeFile(questionsPath, JSON.stringify(enriched)),
    fs.writeFile(path.join(generatedDir, 'legal-authority-report.json'), JSON.stringify(report, null, 2)),
    fs.writeFile(metaPath, JSON.stringify({
      ...meta,
      legalAuthorityVersion: AUTHORITY_VERSION,
      legalAuthorityQuestionCount: report.sourcedCount,
      legalAuthorityMissingCount: report.missingCount,
      legalAuthorityCoverageRate: report.coverageRate,
      officiallyVerifiedAuthorityCount: report.officiallyVerifiedCount,
    }, null, 2)),
    fs.writeFile(qualityPath, JSON.stringify({ ...quality, legalAuthorities: report }, null, 2)),
  ])

  console.log(`[LexQCM] Visas juridiques v${AUTHORITY_VERSION} : ${report.sourcedCount}/${report.questionCount} questions (${report.coverageRate} %).`)
  console.log(`[LexQCM] Liens officiels vérifiés : ${report.officiallyVerifiedCount}. Visas à compléter : ${report.missingCount}.`)
  Object.entries(report.bySubject).forEach(([subject, stats]) => {
    console.log(`[LexQCM] ${subject} — visas ${stats.sourced}/${stats.total}, officiels ${stats.official}, manquants ${stats.missing}.`)
  })
}

await main()
