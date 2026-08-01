import fs from 'node:fs/promises'
import path from 'node:path'

const generatedDir = path.join(process.cwd(), 'public', 'generated')
const CONSENSUS_VERSION = 1
const OFFICIAL_HOSTS = new Set([
  'www.legifrance.gouv.fr','legifrance.gouv.fr','www.courdecassation.fr','courdecassation.fr',
  'www.conseil-etat.fr','conseil-etat.fr','eur-lex.europa.eu','curia.europa.eu','hudoc.echr.coe.int',
])
const STOP = new Set([
  'alors','ainsi','apres','avec','avoir','cette','comme','dans','doit','donc','elle','elles','entre','est','etre','fait','faut',
  'leur','leurs','mais','meme','pour','peut','plus','quand','quelle','quelles','quel','quels','selon','sera','sont','sous','tout',
  'toute','toutes','tous','une','des','les','aux','sur','par','pas','que','qui','quoi','dont','ces','ses','son','lorsque','comment',
  'pourquoi','corrige','reponse','demande','question','droit','regle','principe','conditions','condition','effet','effets','cas','juge',
  'contre','devant','faire','forme','fond','moyen','moyens','partie','parties','instance','action','decision','etre','peuvent','peut',
])

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'")
    .replace(/[^a-zA-Z0-9.'°/-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}
function stem(word) {
  let value = word
  for (const suffix of ['issements','issement','atrices','ateurs','ations','ation','ements','ement','atives','ative','iques','ique','ances','ance','ences','ence','itions','ition','ments','ment','eurs','euses','euse','ables','able','ibles','ible','ives','ive','ifs','if']) {
    if (value.length >= suffix.length + 4 && value.endsWith(suffix)) { value = value.slice(0, -suffix.length); break }
  }
  if (value.length > 5 && value.endsWith('es')) value = value.slice(0, -2)
  else if (value.length > 4 && value.endsWith('s')) value = value.slice(0, -1)
  return value
}
function tokens(value) {
  const base = normalize(value).split(' ').filter((word) => word.length >= 3 && !STOP.has(word)).map(stem).filter((word) => word.length >= 3)
  const result = [...base]
  for (let index = 0; index < base.length - 1; index += 1) result.push(`${base[index]}_${base[index + 1]}`)
  return result
}
function correctAnswer(question) {
  return Array.isArray(question?.answers) && Array.isArray(question?.options)
    ? question.answers.map((index) => question.options[index]).filter(Boolean).join(' ')
    : ''
}
function stripLegal(value) { return String(value || '').replace(/\n\nFondement juridique\s*—[\s\S]*$/u, '').trim() }
function parsePages(value) {
  const match = normalize(value).match(/\bp\.?\s*(\d{1,3})(?:\s*(?:a|à|au|[-–—])\s*(\d{1,3}))?\b/)
  if (!match) return null
  const first = Number(match[1]); const last = Number(match[2] || match[1])
  return { start: Math.min(first, last), end: Math.max(first, last) }
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
function pageMatch(left, right) { return left && right && left.start <= right.end && right.start <= left.end ? 1 : 0 }
function cleanRef(value) { return String(value || '').replace(/\s+/g, ' ').replace(/^[,;:\s]+|[,;:\s]+$/g, '').trim() }
function preciseRef(value) {
  const text = normalize(value)
  return /\d/.test(text) && /\b(article|articles|art\.?|cpc|code|cass\.?|civ\.?|soc\.?|com\.?|crim\.?|ass\.? plen\.?|conseil d'etat|\bce\b|cjue|cedh|loi|decret|reglement|directive)\b/.test(text)
}
function refs(values) {
  const seen = new Set(); const result = []
  for (const raw of Array.isArray(values) ? values : []) {
    const value = cleanRef(raw); const key = normalize(value)
    if (!value || value.length > 240 || seen.has(key) || !preciseRef(value)) continue
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
  const a = refs(left.legalRefs).map(normalize).sort(); const b = refs(right.legalRefs).map(normalize).sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}
function editorialLabel(source) { return String(source?.label || '').replace(/^Source éditoriale\s*:\s*/i, '').trim() }

function flatten(cases) {
  const result = []
  for (const dossier of Array.isArray(cases) ? cases : []) {
    for (const question of Array.isArray(dossier.questions) ? dossier.questions : []) {
      const legalRefs = refs(question.legalRefs)
      if (!legalRefs.length) continue
      const source = question.source || dossier.source || null
      const document = [dossier.topic, question.stem, question.explanation, question.reasoning, correctAnswer(question)].filter(Boolean).join(' ')
      result.push({
        id: question.id,
        subject: dossier.subject || question.subject || '',
        document,
        source,
        sourceParts: parseSource(source),
        legalRefs,
        verified: official(question.verified),
      })
    }
  }
  return result
}

function buildVectors(candidates) {
  const documentFrequency = new Map()
  const tokenized = candidates.map((candidate) => {
    const list = tokens(candidate.document)
    new Set(list).forEach((token) => documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1))
    return list
  })
  const total = Math.max(1, candidates.length)
  const idf = new Map([...documentFrequency].map(([token, count]) => [token, Math.log((total + 1) / (count + 1)) + 1]))
  function vector(list) {
    const counts = new Map(); list.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1))
    const weighted = new Map(); let norm = 0
    counts.forEach((count, token) => {
      const weight = (1 + Math.log(count)) * (idf.get(token) || Math.log(total + 1))
      weighted.set(token, weight); norm += weight * weight
    })
    return { weighted, norm: Math.sqrt(norm) }
  }
  return { idf, vectors: tokenized.map(vector), vector }
}
function cosine(left, right) {
  if (!left.norm || !right.norm) return 0
  const [small, large] = left.weighted.size <= right.weighted.size ? [left.weighted, right.weighted] : [right.weighted, left.weighted]
  let dot = 0; small.forEach((weight, token) => { const other = large.get(token); if (other) dot += weight * other })
  return dot / (left.norm * right.norm)
}

function find(question, candidates, vectorData) {
  const source = parseSource(question.editorialSource || question.source)
  const queryText = [question.topic, question.topic, question.topic, question.stem, stripLegal(question.explanation), correctAnswer(question), correctAnswer(question)].join(' ')
  const queryVector = vectorData.vector(tokens(queryText))
  const ranked = []
  candidates.forEach((candidate, index) => {
    if (normalize(candidate.subject) !== normalize(question.subject)) return
    const similarity = cosine(queryVector, vectorData.vectors[index])
    const provider = source.provider && candidate.sourceParts.provider && source.provider === candidate.sourceParts.provider ? 1 : 0
    const year = source.year && candidate.sourceParts.year && source.year === candidate.sourceParts.year ? 1 : 0
    const number = source.number && candidate.sourceParts.number && source.number === candidate.sourceParts.number ? 1 : 0
    const pages = pageMatch(source.pages, candidate.sourceParts.pages)
    const topicPhrase = normalize(question.topic).length >= 7 && normalize(candidate.document).includes(normalize(question.topic)) ? 1 : 0
    const score = similarity * 0.68 + pages * 0.13 + number * 0.08 + provider * 0.04 + year * 0.02 + topicPhrase * 0.05
    ranked.push({ candidate, score, similarity, pages, number, provider, year, topicPhrase })
  })
  ranked.sort((a, b) => b.score - a.score)
  const best = ranked[0]; const second = ranked[1]
  if (!best) return null
  const margin = best.score - (second?.score || 0)
  const shared = sameRefs(best.candidate, second?.candidate)
  const anchored = best.pages === 1 || best.number === 1
  const anchoredMatch = anchored && best.similarity >= 0.115 && best.score >= 0.245
  const phraseMatch = best.topicPhrase === 1 && best.similarity >= 0.14 && best.score >= 0.265
  const semanticMatch = best.similarity >= 0.24 && best.score >= 0.265
  const strongSemantic = best.similarity >= 0.32
  const distinct = margin >= 0.035 || shared || best.score >= 0.50 || strongSemantic
  if (!(anchoredMatch || phraseMatch || semanticMatch) || !distinct) return null
  return {
    ...best.candidate,
    method: anchoredMatch ? 'case-tfidf-source-match' : phraseMatch ? 'case-tfidf-topic-match' : 'case-tfidf-semantic-match',
    confidence: Number(best.score.toFixed(3)),
    similarity: Number(best.similarity.toFixed(3)),
    margin: Number(margin.toFixed(3)),
  }
}

function apply(question, match) {
  const editorialSource = question.editorialSource || question.source || null
  const label = editorialLabel(editorialSource)
  const verification = official(question.verified) || match.verified || null
  return {
    ...question,
    explanation: `${stripLegal(question.explanation)}\n\nFondement juridique — ${match.legalRefs.join(' ; ')}.`,
    legalRefs: match.legalRefs,
    legalAuthorityStatus: verification ? 'official-verified' : match.method,
    legalAuthorityConfidence: match.confidence,
    legalAuthoritySimilarity: match.similarity,
    legalAuthorityMargin: match.margin,
    legalAuthorityOrigin: match.id,
    verified: verification,
    editorialSource,
    source: {
      ...(editorialSource || {}),
      label: `Visa : ${match.legalRefs.join(' ; ')}${label ? ` · Source éditoriale : ${label}` : ''}`,
      url: verification?.url,
      kind: verification ? 'official' : 'legal-authority',
      verified: verification ? 'official' : match.method,
    },
  }
}

function makeReport(questions) {
  const methods = {}; const bySubject = {}; const missing = []
  let sourcedCount = 0; let officiallyVerifiedCount = 0
  for (const question of questions) {
    const method = question.legalAuthorityStatus || 'missing'; methods[method] = (methods[method] || 0) + 1
    const subject = question.subject || 'Matière inconnue'
    bySubject[subject] ||= { total: 0, sourced: 0, official: 0, missing: 0 }
    bySubject[subject].total += 1
    if (refs(question.legalRefs).length) { sourcedCount += 1; bySubject[subject].sourced += 1 }
    else { bySubject[subject].missing += 1; missing.push({ id: question.id, subject, topic: question.topic, stem: question.stem, editorialSource: question.editorialSource?.label || '' }) }
    if (official(question.verified)) { officiallyVerifiedCount += 1; bySubject[subject].official += 1 }
  }
  return {
    generatedAt: new Date().toISOString(), authorityVersion: 1, refinementVersion: 1, conceptExpansionVersion: 1,
    consensusVersion: CONSENSUS_VERSION, questionCount: questions.length, sourcedCount, officiallyVerifiedCount,
    missingCount: questions.length - sourcedCount, coverageRate: questions.length ? Math.round((sourcedCount / questions.length) * 1000) / 10 : 0,
    methods, bySubject, missing,
    policy: { editorialSourceIsNotLegalAuthority: true, ambiguousMatchesAreRejected: true, noInferredCitation: true,
      acceptedAuthorities: 'Référence précise contenant un article, un texte numéroté ou une décision datée.', officialLinks: [...OFFICIAL_HOSTS] },
  }
}

async function main() {
  const paths = {
    questions: path.join(generatedDir, 'questions.json'), cases: path.join(generatedDir, 'cases.json'), meta: path.join(generatedDir, 'meta.json'),
    quality: path.join(generatedDir, 'quality-report.json'), report: path.join(generatedDir, 'legal-authority-report.json'),
  }
  const [questions, cases, meta, quality] = await Promise.all([
    fs.readFile(paths.questions, 'utf8').then(JSON.parse), fs.readFile(paths.cases, 'utf8').then(JSON.parse),
    fs.readFile(paths.meta, 'utf8').then(JSON.parse), fs.readFile(paths.quality, 'utf8').then(JSON.parse),
  ])
  const candidates = flatten(cases)
  const vectorData = buildVectors(candidates)
  let added = 0
  const result = questions.map((question) => {
    if (refs(question.legalRefs).length) return question
    const match = find(question, candidates, vectorData)
    if (!match) return question
    added += 1
    return apply(question, match)
  })
  const report = makeReport(result)
  if (result.some((question) => refs(question.legalRefs).length !== (question.legalRefs || []).length)) throw new Error('Référence juridique imprécise après consensus lexical.')
  await Promise.all([
    fs.writeFile(paths.questions, JSON.stringify(result)), fs.writeFile(paths.report, JSON.stringify(report, null, 2)),
    fs.writeFile(paths.meta, JSON.stringify({ ...meta, legalAuthorityConsensusVersion: CONSENSUS_VERSION, legalAuthorityQuestionCount: report.sourcedCount, legalAuthorityMissingCount: report.missingCount, legalAuthorityCoverageRate: report.coverageRate, officiallyVerifiedAuthorityCount: report.officiallyVerifiedCount }, null, 2)),
    fs.writeFile(paths.quality, JSON.stringify({ ...quality, legalAuthorities: report }, null, 2)),
  ])
  console.log(`[LexQCM] Consensus lexical v${CONSENSUS_VERSION} : ${added} visa(s) supplémentaire(s).`)
  console.log(`[LexQCM] Couverture juridique finale : ${report.sourcedCount}/${report.questionCount} (${report.coverageRate} %), ${report.missingCount} à vérifier.`)
  Object.entries(report.bySubject).forEach(([subject, stats]) => console.log(`[LexQCM] ${subject} — visas ${stats.sourced}/${stats.total}, officiels ${stats.official}, manquants ${stats.missing}.`))
}

await main()
