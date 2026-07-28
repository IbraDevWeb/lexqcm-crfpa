import fs from 'node:fs/promises'
import path from 'node:path'

const generatedDir = path.join(process.cwd(), 'public', 'generated')
const questionsPath = path.join(generatedDir, 'questions.json')
const metaPath = path.join(generatedDir, 'meta.json')
const qualityPath = path.join(generatedDir, 'quality-report.json')

const [questions, meta, quality] = await Promise.all([
  fs.readFile(questionsPath, 'utf8').then(JSON.parse),
  fs.readFile(metaPath, 'utf8').then(JSON.parse),
  fs.readFile(qualityPath, 'utf8').then(JSON.parse),
])
if (!Array.isArray(questions)) throw new Error('Banque invalide avant restauration du statut IEJ.')

let restored = 0
const updated = questions.map((question) => {
  if (!String(question.id).startsWith('IEJ26-')) return question
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
if (restored !== 360) throw new Error(`Restauration IEJ incomplète : ${restored}/360.`)

await Promise.all([
  fs.writeFile(questionsPath, JSON.stringify(updated)),
  fs.writeFile(metaPath, JSON.stringify({ ...meta, iejSorbonneExplicitSourceCount: restored }, null, 2)),
  fs.writeFile(qualityPath, JSON.stringify({
    ...quality,
    iejSorbonneExplicitSources: {
      count: restored,
      policy: 'Le visa provient directement de l’autorité mentionnée dans le fascicule et non d’un rapprochement avec une autre question.',
    },
  }, null, 2)),
])

console.log(`[LexQCM] Provenance IEJ restaurée : ${restored} QCM marqués source-explicit.`)
