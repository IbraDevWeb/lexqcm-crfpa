import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd()
const sourceDir = path.join(root, 'data', 'prebarreau-procedure-civile-2025-sourced')
const targetDir = path.join(root, 'data', 'generated-prebarreau-procedure-civile-2025-sourced')
const PREFIX = 'PB25-PC-VISA-'
const EXPECTED_RECORDS = 150
const EXPECTED_QUESTIONS = 300

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function stableTie(value) {
  return createHash('sha1').update(value).digest('hex')
}

function isPreciseReference(value) {
  const text = normalize(value)
  return /\d/.test(text)
    && /\b(article|articles|art\.?|cpc|cpce|coj|code|cass\.?|civ\.?|soc\.?|com\.?|crim\.?|ch\.? mixte|ass\.? plen\.?|conseil constitutionnel|conseil d'etat|\bce\b|cjue|cedh|loi|decret|reglement|directive|avis)\b/.test(text)
}

function visaText(record) {
  return record.legalRefs.join(' ; ')
}

function candidateValue(record, field) {
  return field === 'visa' ? visaText(record) : record.rule
}

function distractors(record, records, field, salt = '') {
  const correct = candidateValue(record, field)
  const orderedPools = [
    records.filter((other) => other.topic === record.topic),
    records.filter((other) => other.documentCode === record.documentCode),
    records,
  ]
  const output = []
  const seen = new Set([normalize(correct)])
  for (const pool of orderedPools) {
    const ranked = pool
      .filter((other) => other !== record)
      .map((other) => ({
        record: other,
        value: candidateValue(other, field),
        delta: Math.abs(candidateValue(other, field).length - correct.length),
        tie: stableTie(`${record.documentCode}|${record.page}|${field}|${salt}|${other.documentCode}|${other.page}|${candidateValue(other, field)}`),
      }))
      .sort((left, right) => left.delta - right.delta || left.tie.localeCompare(right.tie))
    for (const candidate of ranked) {
      const key = normalize(candidate.value)
      if (!candidate.value || seen.has(key)) continue
      seen.add(key)
      output.push(candidate)
      if (output.length === 3) return output
    }
  }
  throw new Error(`Distracteurs insuffisants pour ${record.documentCode} p. ${record.page} (${field}).`)
}

function baseQuestion(record, id, sourceRecordId) {
  const editorialLabel = `${record.documentTitle} — PDF p. ${record.page}`
  const legalRefs = [...record.legalRefs]
  return {
    id,
    subject: 'Procédure civile',
    topic: record.topic,
    difficulty: 2,
    type: 'single',
    mode: 'case',
    legalRefs,
    legalAuthorityStatus: 'source-explicit',
    editorialSource: {
      label: editorialLabel,
      kind: 'editorial',
      pages: String(record.page),
    },
    source: {
      label: `Visa : ${visaText(record)} · Source éditoriale : ${editorialLabel}`,
      kind: 'legal-authority',
      verified: 'source-explicit',
      asOf: '2025-12-31',
    },
    tags: ['pre-barreau', 'corrige-2025', 'procedure-civile', 'visa-explicite', 'page-verifiee'],
    sourceRecordId,
    sourceDocumentCode: record.documentCode,
    active: true,
  }
}

function buildQuestions(records) {
  const questions = []
  records.forEach((record, recordIndex) => {
    const sourceRecordId = `${record.documentCode}-R${String((recordIndex % 10) + 1).padStart(2, '0')}`
    const ruleDistractors = distractors(record, records, 'rule', 'regle')
    const visaDistractors = distractors(record, records, 'visa', 'visa')
    const ruleId = `${PREFIX}${String((recordIndex * 2) + 1).padStart(3, '0')}`
    const visaId = `${PREFIX}${String((recordIndex * 2) + 2).padStart(3, '0')}`
    const editorialLabel = `${record.documentTitle}, PDF p. ${record.page}`

    questions.push({
      ...baseQuestion(record, ruleId, sourceRecordId),
      stem: `Dans le corrigé ${record.documentCode}, page ${record.page}, quelle règle relative à « ${record.topic} » est directement fondée sur le visa suivant : ${visaText(record)} ?`,
      options: [record.rule, ...ruleDistractors.map((candidate) => candidate.value)],
      answers: [0],
      explanation: `${record.rule}\n\nFondement juridique — ${visaText(record)}.\n\nTraçabilité éditoriale — ${editorialLabel}.`,
      optionExplanations: [
        `Correct : cette règle est expressément rattachée à ${visaText(record)} dans le corrigé.`,
        ...ruleDistractors.map((candidate) => `Cette proposition correspond à ${visaText(candidate.record)}, et non au visa demandé.`),
      ],
    })

    questions.push({
      ...baseQuestion(record, visaId, sourceRecordId),
      stem: `Dans le corrigé ${record.documentCode}, page ${record.page}, quel visa juridique correspond à la règle suivante : « ${record.rule.replace(/[. ]+$/, '')} » ?`,
      options: [visaText(record), ...visaDistractors.map((candidate) => candidate.value)],
      answers: [0],
      explanation: `Le visa correspondant est ${visaText(record)}. La règle contrôlée est la suivante : ${record.rule}\n\nFondement juridique — ${visaText(record)}.\n\nTraçabilité éditoriale — ${editorialLabel}.`,
      optionExplanations: [
        `Correct : le corrigé rattache directement cette règle à ${visaText(record)}.`,
        ...visaDistractors.map((candidate) => `Ce visa fonde une autre règle du corpus : ${candidate.record.rule}`),
      ],
    })
  })
  return questions
}

function validateRecord(record, index) {
  if (!record || typeof record !== 'object') throw new Error(`Registre ${index + 1} invalide.`)
  for (const field of ['documentCode', 'documentTitle', 'sourceFile', 'rule', 'topic']) {
    if (typeof record[field] !== 'string' || !record[field].trim()) throw new Error(`Registre ${index + 1} : champ ${field} absent.`)
  }
  if (!Number.isInteger(record.page) || record.page < 1) throw new Error(`Registre ${index + 1} : page invalide.`)
  if (!Array.isArray(record.legalRefs) || !record.legalRefs.length || !record.legalRefs.every(isPreciseReference)) {
    throw new Error(`Registre ${index + 1} : visa imprécis (${JSON.stringify(record.legalRefs)}).`)
  }
  if (record.rule.length < 45 || record.rule.length > 950) throw new Error(`Registre ${index + 1} : règle trop courte ou trop longue.`)
}

function validateQuestion(question) {
  if (!question.id.startsWith(PREFIX) || question.subject !== 'Procédure civile') return false
  if (question.legalAuthorityStatus !== 'source-explicit') return false
  if (!Array.isArray(question.options) || question.options.length !== 4 || new Set(question.options.map(normalize)).size !== 4) return false
  if (!Array.isArray(question.answers) || question.answers.length !== 1 || question.answers[0] !== 0) return false
  if (!Array.isArray(question.legalRefs) || !question.legalRefs.length || !question.legalRefs.every(isPreciseReference)) return false
  if (!question.source?.label?.startsWith('Visa :') || !question.editorialSource?.label?.includes('PDF p.')) return false
  if (!question.explanation?.includes('Fondement juridique') || !question.explanation?.includes('Traçabilité éditoriale')) return false
  if (!Array.isArray(question.optionExplanations) || question.optionExplanations.length !== question.options.length) return false
  return true
}

async function readRecords() {
  const manifest = JSON.parse(await fs.readFile(path.join(sourceDir, 'manifest.json'), 'utf8'))
  if (!Array.isArray(manifest.documents) || manifest.documents.length !== 15 || Number(manifest.sourceRecordCount) !== EXPECTED_RECORDS) {
    throw new Error('Manifeste Pré-Barreau 2025 incomplet.')
  }
  const documents = new Map(manifest.documents.map((document) => [document.documentCode, document]))
  const entries = (await fs.readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^records-batch-\d{2}\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'fr'))
  if (entries.length !== 5) throw new Error(`Lots source Pré-Barreau incomplets : ${entries.length}/5.`)
  const batches = await Promise.all(entries.map((entry) => fs.readFile(path.join(sourceDir, entry), 'utf8').then(JSON.parse)))
  if (batches.some((batch) => !Array.isArray(batch) || batch.length !== 30)) {
    throw new Error('Un lot source Pré-Barreau ne contient pas exactement 30 registres.')
  }
  return batches.flat().map((record) => {
    const document = documents.get(record.documentCode)
    if (!document) throw new Error(`Document inconnu pour ${record.documentCode}.`)
    return {
      ...record,
      documentTitle: document.title,
      sourceFile: document.sourceFile,
    }
  })
}

async function main() {
  const records = await readRecords()
  if (!Array.isArray(records) || records.length !== EXPECTED_RECORDS) {
    throw new Error(`Registres source incomplets : ${Array.isArray(records) ? records.length : 0}/${EXPECTED_RECORDS}.`)
  }
  records.forEach(validateRecord)
  const countsByDocument = records.reduce((counts, record) => {
    counts[record.documentCode] = (counts[record.documentCode] || 0) + 1
    return counts
  }, {})
  if (Object.keys(countsByDocument).length !== 15 || Object.values(countsByDocument).some((count) => count !== 10)) {
    throw new Error(`Répartition documentaire invalide : ${JSON.stringify(countsByDocument)}.`)
  }

  const questions = buildQuestions(records)
  if (questions.length !== EXPECTED_QUESTIONS) throw new Error(`Génération incomplète : ${questions.length}/${EXPECTED_QUESTIONS}.`)
  if (new Set(questions.map((question) => question.id)).size !== questions.length) throw new Error('Identifiants Pré-Barreau dupliqués.')
  if (new Set(questions.map((question) => normalize(question.stem))).size !== questions.length) throw new Error('Énoncés Pré-Barreau dupliqués.')
  if (questions.some((question) => !validateQuestion(question))) throw new Error('Une question Pré-Barreau ne respecte pas le contrat de sourcing.')

  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.mkdir(targetDir, { recursive: true })
  await fs.writeFile(path.join(targetDir, 'questions.json'), JSON.stringify(questions))
  console.log(`[LexQCM] Pré-Barreau 2025 — procédure civile : ${questions.length} QCM sourcés générés depuis ${records.length} règles vérifiées dans 15 corrigés.`)
  console.log(`[LexQCM] Répartition source : ${JSON.stringify(countsByDocument)}.`)
}

await main()
