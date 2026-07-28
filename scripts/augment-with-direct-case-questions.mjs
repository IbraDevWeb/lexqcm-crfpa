import fs from 'node:fs/promises'
import path from 'node:path'

const generatedDir = path.join(process.cwd(), 'public', 'generated')
const DIRECT_CASE_VERSION = 1
const OFFICIAL_HOSTS = new Set([
  'www.legifrance.gouv.fr','legifrance.gouv.fr','www.courdecassation.fr','courdecassation.fr',
  'www.conseil-etat.fr','conseil-etat.fr','eur-lex.europa.eu','curia.europa.eu','hudoc.echr.coe.int',
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

function legalRefs(values) {
  const seen = new Set()
  const result = []
  for (const raw of Array.isArray(values) ? values : []) {
    const value = String(raw || '').replace(/\s+/g, ' ').trim()
    const key = normalize(value)
    if (!value || seen.has(key) || !isPreciseLegalReference(value)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function officialVerification(value) {
  if (!value || typeof value.url !== 'string') return null
  try {
    const url = new URL(value.url)
    if (url.protocol !== 'https:' || !OFFICIAL_HOSTS.has(url.hostname)) return null
    return { status: value.status || 'officiel', label: value.label || 'Source officielle', url: url.toString() }
  } catch {
    return null
  }
}

function editorialLabel(source) {
  return String(source?.label || '').replace(/^Source éditoriale\s*:\s*/i, '').trim()
}

function stripLegalBlock(value) {
  return String(value || '').replace(/\n\nFondement juridique\s*—[\s\S]*$/u, '').trim()
}

function buildDirectQuestions(cases) {
  const questions = []
  for (const dossier of Array.isArray(cases) ? cases : []) {
    if (dossier.status === 'source_only') continue
    for (const step of Array.isArray(dossier.questions) ? dossier.questions : []) {
      const refs = legalRefs(step.legalRefs)
      if (!refs.length || !Array.isArray(step.options) || !Array.isArray(step.answers) || !step.stem) continue
      const source = step.source || dossier.source || null
      const verified = officialVerification(step.verified)
      const label = editorialLabel(source)
      const baseExplanation = stripLegalBlock(step.explanation)
      const reasoning = step.reasoning && !normalize(baseExplanation).includes(normalize(step.reasoning))
        ? `\n\nMéthode — ${String(step.reasoning).trim()}`
        : ''
      questions.push({
        id: `CASE-QCM-${step.id}`,
        subject: dossier.subject || 'Matière inconnue',
        topic: dossier.topic || step.phase || 'Cas pratique',
        difficulty: 2,
        type: step.type || (step.answers.length > 1 ? 'multiple' : 'single'),
        mode: 'case',
        stem: step.stem,
        options: step.options,
        answers: [...step.answers].sort((a, b) => a - b),
        explanation: `${baseExplanation}${reasoning}\n\nFondement juridique — ${refs.join(' ; ')}.`,
        optionExplanations: [],
        legalRefs: refs,
        legalAuthorityStatus: verified ? 'case-direct-official' : 'case-direct',
        verified,
        editorialSource: source,
        source: {
          ...(source || {}),
          label: `Visa : ${refs.join(' ; ')}${label ? ` · Source éditoriale : ${label}` : ''}`,
          url: verified?.url,
          kind: verified ? 'official' : 'legal-authority',
          verified: verified ? 'official' : 'case-direct',
        },
        tags: ['dossier-source', 'visa-direct', ...(Array.isArray(dossier.tags) ? dossier.tags : [])],
        catalogOrigin: 'case-bank',
        caseId: dossier.id,
        caseQuestionId: step.id,
        active: true,
      })
    }
  }
  return [...new Map(questions.map((question) => [question.id, question])).values()]
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
  if (!Array.isArray(questions) || !Array.isArray(cases)) throw new Error('Catalogue invalide avant ajout des QCM à visa direct.')

  const cleanQuestions = questions.filter((question) => question.catalogOrigin !== 'case-bank')
  const directQuestions = buildDirectQuestions(cases)
  const combined = [...cleanQuestions, ...directQuestions]
  if (new Set(combined.map((question) => question.id)).size !== combined.length) throw new Error('Identifiants dupliqués après ajout des QCM à visa direct.')
  if (directQuestions.some((question) => !question.legalRefs.every(isPreciseLegalReference))) throw new Error('Un QCM de dossier ne possède pas de visa précis.')

  const directBySubject = directQuestions.reduce((counts, question) => {
    counts[question.subject] = (counts[question.subject] || 0) + 1
    return counts
  }, {})

  await Promise.all([
    fs.writeFile(questionsPath, JSON.stringify(combined)),
    fs.writeFile(metaPath, JSON.stringify({
      ...meta,
      directCaseQuestionVersion: DIRECT_CASE_VERSION,
      directCaseQuestionCount: directQuestions.length,
      directCaseQuestionsBySubject: directBySubject,
    }, null, 2)),
    fs.writeFile(qualityPath, JSON.stringify({
      ...quality,
      directCaseQuestions: {
        version: DIRECT_CASE_VERSION,
        count: directQuestions.length,
        bySubject: directBySubject,
        policy: 'Questions reprises directement des dossiers dotés de leurs propres visas, sans rapprochement avec un autre énoncé.',
      },
    }, null, 2)),
  ])

  console.log(`[LexQCM] QCM à visa direct : ${directQuestions.length} question(s) ajoutée(s) depuis ${cases.length} dossier(s).`)
  Object.entries(directBySubject).forEach(([subject, count]) => console.log(`[LexQCM] ${subject} — ${count} QCM de dossier à visa direct.`))
}

await main()
