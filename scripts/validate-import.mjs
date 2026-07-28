import fs from 'node:fs/promises'

const meta = JSON.parse(await fs.readFile('public/generated/meta.json', 'utf8'))
const questions = JSON.parse(await fs.readFile('public/generated/questions.json', 'utf8'))
const quality = JSON.parse(await fs.readFile('public/generated/quality-report.json', 'utf8'))
const editorialReview = JSON.parse(await fs.readFile('public/generated/questions-editorial-review.json', 'utf8'))
const cases = Number(meta.caseCount || 0)

console.log(`[LexQCM] Banque QCM publiée : ${questions.length} questions.`)
console.log(`[LexQCM] Questions écartées : ${editorialReview.length}.`)
console.log(`[LexQCM] Dossiers progressifs : ${cases}.`)

if (meta.cleanQuestionBase !== true) {
  throw new Error('La banque n’est pas marquée comme base QCM saine.')
}
if (meta.importedFromLegacy !== false) {
  throw new Error('Une source QCM legacy est encore déclarée dans les métadonnées.')
}
if (questions.length !== 120 || Number(meta.questionCount) !== 120 || Number(meta.sourceQuestionCount) !== 120) {
  throw new Error(`La banque doit contenir exactement 120 questions, ${questions.length} détectées.`)
}
if (editorialReview.length !== 0 || Number(meta.editorialReviewCount) !== 0 || Number(quality.excludedCount) !== 0) {
  throw new Error('Des questions étrangères ou rejetées subsistent dans la banque propre.')
}
if (quality.keptCount !== 120 || quality.inputCount !== 120) {
  throw new Error('Le rapport qualité ne correspond pas aux 120 questions du socle.')
}
if (questions.some((q) => q.subject !== 'Procédure civile' || !String(q.id).startsWith('PC26-CORR-'))) {
  throw new Error('Une question extérieure au lot procédure civile 2026 a été détectée.')
}
if (new Set(questions.map((q) => q.id)).size !== 120) {
  throw new Error('Des identifiants QCM sont dupliqués.')
}
if (cases < 30) {
  throw new Error(`Import incomplet des dossiers : seulement ${cases} détectés.`)
}
