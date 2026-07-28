import fs from 'node:fs/promises'

const meta = JSON.parse(await fs.readFile('public/generated/meta.json', 'utf8'))
const sourceQuestions = Number(meta.sourceQuestionCount || meta.questionCount || 0)
const usefulQuestions = Number(meta.questionCount || 0)
const editorialReview = Number(meta.editorialReviewCount || 0)
const cases = Number(meta.caseCount || 0)

console.log(`[LexQCM] Validation banque source: ${sourceQuestions} questions.`)
console.log(`[LexQCM] Banque utile publiée: ${usefulQuestions} questions.`)
console.log(`[LexQCM] Revue éditoriale: ${editorialReview} questions écartées.`)
console.log(`[LexQCM] Dossiers: ${cases}.`)

if (sourceQuestions < 2300) {
  throw new Error(`Import source incomplet: seulement ${sourceQuestions} questions détectées.`)
}
if (usefulQuestions < 1500) {
  throw new Error(`Filtre éditorial trop agressif: seulement ${usefulQuestions} questions utiles conservées.`)
}
if (usefulQuestions + editorialReview !== sourceQuestions) {
  throw new Error('Le bilan éditorial ne correspond pas au nombre de questions source.')
}
if (cases < 30) {
  throw new Error(`Import incomplet: seulement ${cases} dossiers détectés.`)
}
