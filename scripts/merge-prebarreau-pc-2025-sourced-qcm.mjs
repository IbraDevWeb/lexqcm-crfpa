import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const generatedDir = path.join(root, 'public', 'generated')
const set = {
  directory: 'data/generated-prebarreau-procedure-civile-2025-sourced',
  subject: 'Procédure civile',
  prefix: 'PB25-PC-VISA-',
  expected: 300,
  label: 'Pré-Barreau 2025 — 15 corrigés de procédure civile — banque à visas explicites',
}

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
    && /\b(article|articles|art\.?|cpc|cpce|coj|code|cass\.?|civ\.?|soc\.?|com\.?|crim\.?|ch\.? mixte|ass\.? plen\.?|conseil constitutionnel|conseil d'etat|\bce\b|cjue|cedh|loi|decret|reglement|directive|avis)\b/.test(text)
}

function validateQuestion(question) {
  if (!question || typeof question.id !== 'string' || !question.id.startsWith(set.prefix)) return false
  if (question.subject !== set.subject || question.legalAuthorityStatus !== 'source-explicit') return false
  if (!Array.isArray(question.options) || question.options.length !== 4 || new Set(question.options.map(normalize)).size !== 4) return false
  if (!Array.isArray(question.answers) || question.answers.length !== 1 || question.answers[0] !== 0) return false
  if (!Array.isArray(question.legalRefs) || !question.legalRefs.length || !question.legalRefs.every(isPreciseReference)) return false
  if (!question.source?.label?.startsWith('Visa :') || !question.editorialSource?.label?.includes('Pré-Barreau 2025') || !question.editorialSource?.label?.includes('PDF p.')) return false
  if (!question.explanation?.includes('Fondement juridique') || !question.explanation?.includes('Traçabilité éditoriale')) return false
  if (!question.tags?.includes('visa-explicite') || !question.tags?.includes('page-verifiee')) return false
  return true
}

async function main() {
  const questionsPath = path.join(generatedDir, 'questions.json')
  const metaPath = path.join(generatedDir, 'meta.json')
  const qualityPath = path.join(generatedDir, 'quality-report.json')
  const sourceQuestionsPath = path.join(root, set.directory, 'questions.json')
  const [existingQuestions, meta, quality, generatedQuestions] = await Promise.all([
    fs.readFile(questionsPath, 'utf8').then(JSON.parse),
    fs.readFile(metaPath, 'utf8').then(JSON.parse),
    fs.readFile(qualityPath, 'utf8').then(JSON.parse),
    fs.readFile(sourceQuestionsPath, 'utf8').then(JSON.parse),
  ])
  if (!Array.isArray(existingQuestions)) throw new Error('Banque principale invalide avant fusion Pré-Barreau 2025.')
  if (!Array.isArray(generatedQuestions) || generatedQuestions.length !== set.expected) {
    throw new Error(`Lot Pré-Barreau 2025 incomplet : ${Array.isArray(generatedQuestions) ? generatedQuestions.length : 0}/${set.expected}.`)
  }
  if (generatedQuestions.some((question) => !validateQuestion(question))) {
    throw new Error('Lot Pré-Barreau 2025 : une question ne respecte pas le contrat de sourcing.')
  }
  if (new Set(generatedQuestions.map((question) => question.id)).size !== generatedQuestions.length) {
    throw new Error('Lot Pré-Barreau 2025 : identifiants dupliqués.')
  }

  const withoutPrevious = existingQuestions.filter((question) => !String(question.id).startsWith(set.prefix))
  const merged = [...withoutPrevious, ...generatedQuestions]
  if (new Set(merged.map((question) => question.id)).size !== merged.length) throw new Error('Identifiants dupliqués après fusion Pré-Barreau 2025.')

  const countsBySubject = merged.reduce((counts, question) => {
    counts[question.subject] = (counts[question.subject] || 0) + 1
    return counts
  }, {})
  const questionSources = [...new Set([...(Array.isArray(meta.questionSources) ? meta.questionSources : []), set.label])]

  await Promise.all([
    fs.writeFile(questionsPath, JSON.stringify(merged)),
    fs.writeFile(metaPath, JSON.stringify({
      ...meta,
      sourceQuestionCount: merged.length,
      questionCount: merged.length,
      questionsBySubject: countsBySubject,
      questionSources,
      prebarreauPc2025SourcedQuestionCount: generatedQuestions.length,
      prebarreauPc2025SourcedPrefix: set.prefix,
      prebarreauPc2025SourceDocumentCount: 15,
      procedureCivileCorrectionQuestionCount: countsBySubject['Procédure civile'] || 0,
    }, null, 2)),
    fs.writeFile(qualityPath, JSON.stringify({
      ...quality,
      inputCount: merged.length,
      keptCount: merged.length,
      excludedCount: 0,
      excludedRate: 0,
      prebarreauPc2025Sourced: {
        count: generatedQuestions.length,
        sourceRecordCount: 150,
        sourceDocumentCount: 15,
        policy: 'Chaque QCM est construit à partir d’une règle et d’un visa figurant sur la même page d’un corrigé Pré-Barreau 2025.',
      },
    }, null, 2)),
  ])

  console.log(`[LexQCM] Fusion Pré-Barreau 2025 : ${generatedQuestions.length} QCM de procédure civile sourcés ajoutés.`)
  console.log(`[LexQCM] Socle éditorial après fusion : ${merged.length} QCM.`)
}

await main()
