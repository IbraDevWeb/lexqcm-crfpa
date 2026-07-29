import fs from 'node:fs/promises'
import path from 'node:path'

const generatedDir = path.join(process.cwd(), 'public', 'generated')
const questionsPath = path.join(generatedDir, 'questions.json')
const metaPath = path.join(generatedDir, 'meta.json')
const qualityPath = path.join(generatedDir, 'quality-report.json')
const PREFIX = 'PB25-PC-VISA-'
const EXPECTED = 300

const [questions, meta, quality] = await Promise.all([
  fs.readFile(questionsPath, 'utf8').then(JSON.parse),
  fs.readFile(metaPath, 'utf8').then(JSON.parse),
  fs.readFile(qualityPath, 'utf8').then(JSON.parse),
])
if (!Array.isArray(questions)) throw new Error('Banque invalide avant restauration du statut Pré-Barreau.')

let restored = 0
const updated = questions.map((question) => {
  if (!String(question.id).startsWith(PREFIX)) return question
  restored += 1
  return {
    ...question,
    legalAuthorityStatus: 'source-explicit',
    source: {
      ...(question.source || {}),
      kind: 'legal-authority',
      verified: 'source-explicit',
    },
  }
})
if (restored !== EXPECTED) throw new Error(`Restauration Pré-Barreau incomplète : ${restored}/${EXPECTED}.`)

await Promise.all([
  fs.writeFile(questionsPath, JSON.stringify(updated)),
  fs.writeFile(metaPath, JSON.stringify({ ...meta, prebarreauPc2025ExplicitSourceCount: restored }, null, 2)),
  fs.writeFile(qualityPath, JSON.stringify({
    ...quality,
    prebarreauPc2025ExplicitSources: {
      count: restored,
      policy: 'Le visa et la règle proviennent directement du même registre de page du corrigé, sans rapprochement avec une autre question.',
    },
  }, null, 2)),
])

console.log(`[LexQCM] Provenance Pré-Barreau restaurée : ${restored} QCM marqués source-explicit.`)
