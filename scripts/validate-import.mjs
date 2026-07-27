import fs from 'node:fs/promises'

const meta = JSON.parse(await fs.readFile('public/generated/meta.json', 'utf8'))
const questions = Number(meta.questionCount || 0)
const cases = Number(meta.caseCount || 0)

console.log(`[LexQCM] Validation banque: ${questions} questions, ${cases} dossiers.`)

if (questions < 2000) {
  throw new Error(`Import incomplet: seulement ${questions} questions détectées.`)
}
if (cases < 30) {
  throw new Error(`Import incomplet: seulement ${cases} dossiers détectés.`)
}
