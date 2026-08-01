import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const generatedDir = path.join(root, 'public', 'generated')
const sets = [
  {
    directory: 'data/generated-iej-sorbonne-procedure-civile-2026',
    subject: 'Procédure civile',
    prefix: 'IEJ26-PC-',
    expected: 120,
    label: 'IEJ de la Sorbonne 2026 — Fascicule de révision et d’actualisation — Procédure civile',
  },
  {
    directory: 'data/generated-iej-sorbonne-obligations-2026',
    subject: 'Droit des obligations',
    prefix: 'IEJ26-OB-',
    expected: 120,
    label: 'IEJ de la Sorbonne 2026 — Fascicule de révision et d’actualisation — Droit des obligations',
  },
  {
    directory: 'data/generated-iej-sorbonne-droit-social-2026',
    subject: 'Droit social',
    prefix: 'IEJ26-DS-',
    expected: 120,
    label: 'IEJ de la Sorbonne 2026 — Fascicule de révision et d’actualisation — Droit social',
  },
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

function isPreciseReference(value) {
  const text = normalize(value)
  return /\d/.test(text)
    && /\b(article|articles|art\.?|cpc|code|cass\.?|civ\.?|soc\.?|com\.?|crim\.?|ass\.? plen\.?|conseil d'etat|\bce\b|cjue|cedh|loi|decret|reglement|directive)\b/.test(text)
}

function validateQuestion(question, set) {
  if (!question || typeof question.id !== 'string' || !question.id.startsWith(set.prefix)) return false
  if (question.subject !== set.subject || question.legalAuthorityStatus !== 'source-explicit') return false
  if (!Array.isArray(question.options) || question.options.length !== 4 || new Set(question.options.map(normalize)).size !== 4) return false
  if (!Array.isArray(question.answers) || question.answers.length !== 1 || question.answers[0] !== 0) return false
  if (!Array.isArray(question.legalRefs) || !question.legalRefs.length || !question.legalRefs.every(isPreciseReference)) return false
  if (!question.source?.label?.startsWith('Visa :') || !question.editorialSource?.label?.includes('PDF p.')) return false
  if (!question.explanation?.includes('Fondement juridique')) return false
  return true
}

async function readSet(set) {
  const value = JSON.parse(await fs.readFile(path.join(root, set.directory, 'questions.json'), 'utf8'))
  if (!Array.isArray(value) || value.length !== set.expected) {
    throw new Error(`Lot IEJ ${set.subject} incomplet : ${Array.isArray(value) ? value.length : 0}/${set.expected}.`)
  }
  if (value.some((question) => !validateQuestion(question, set))) {
    throw new Error(`Lot IEJ ${set.subject} : une question ne respecte pas le contrat de sourcing.`)
  }
  if (new Set(value.map((question) => question.id)).size !== value.length) {
    throw new Error(`Lot IEJ ${set.subject} : identifiants dupliqués.`)
  }
  return value
}

async function main() {
  const questionsPath = path.join(generatedDir, 'questions.json')
  const metaPath = path.join(generatedDir, 'meta.json')
  const qualityPath = path.join(generatedDir, 'quality-report.json')
  const [existingQuestions, meta, quality, ...generatedSets] = await Promise.all([
    fs.readFile(questionsPath, 'utf8').then(JSON.parse),
    fs.readFile(metaPath, 'utf8').then(JSON.parse),
    fs.readFile(qualityPath, 'utf8').then(JSON.parse),
    ...sets.map(readSet),
  ])
  if (!Array.isArray(existingQuestions)) throw new Error('Banque principale invalide avant fusion IEJ Sorbonne.')

  const generatedQuestions = generatedSets.flat()
  const generatedIds = new Set(generatedQuestions.map((question) => question.id))
  const withoutPreviousIej = existingQuestions.filter((question) => !generatedIds.has(question.id) && !String(question.id).startsWith('IEJ26-'))
  const merged = [...withoutPreviousIej, ...generatedQuestions]
  if (new Set(merged.map((question) => question.id)).size !== merged.length) throw new Error('Identifiants dupliqués après fusion IEJ Sorbonne.')

  const countsBySubject = merged.reduce((counts, question) => {
    counts[question.subject] = (counts[question.subject] || 0) + 1
    return counts
  }, {})
  const generatedBySubject = generatedQuestions.reduce((counts, question) => {
    counts[question.subject] = (counts[question.subject] || 0) + 1
    return counts
  }, {})
  const questionSources = [...new Set([...(Array.isArray(meta.questionSources) ? meta.questionSources : []), ...sets.map((set) => set.label)])]

  await Promise.all([
    fs.writeFile(questionsPath, JSON.stringify(merged)),
    fs.writeFile(metaPath, JSON.stringify({
      ...meta,
      sourceQuestionCount: merged.length,
      questionCount: merged.length,
      questionsBySubject: countsBySubject,
      questionSources,
      iejSorbonne2026QuestionCount: generatedQuestions.length,
      iejSorbonne2026BySubject: generatedBySubject,
      iejSorbonne2026Prefixes: sets.map((set) => set.prefix),
      procedureCivileCorrectionQuestionCount: countsBySubject['Procédure civile'] || 0,
      obligationsCorrectionQuestionCount: countsBySubject['Droit des obligations'] || 0,
      droitSocialCorrectionQuestionCount: countsBySubject['Droit social'] || 0,
    }, null, 2)),
    fs.writeFile(qualityPath, JSON.stringify({
      ...quality,
      inputCount: merged.length,
      keptCount: merged.length,
      excludedCount: 0,
      excludedRate: 0,
      iejSorbonne2026: {
        count: generatedQuestions.length,
        bySubject: generatedBySubject,
        policy: 'Chaque QCM est relié à une autorité explicitement mentionnée et à la page PDF du fascicule 2026 correspondant.',
      },
    }, null, 2)),
  ])

  console.log(`[LexQCM] Fusion IEJ Sorbonne 2026 : ${generatedQuestions.length} QCM ajoutés à la banque éditoriale.`)
  Object.entries(generatedBySubject).forEach(([subject, count]) => console.log(`[LexQCM] ${subject} — ${count} nouveaux QCM IEJ sourcés.`))
  console.log(`[LexQCM] Socle éditorial après fusion : ${merged.length} QCM.`)
}

await main()
