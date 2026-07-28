import fs from 'node:fs/promises'

const meta = JSON.parse(await fs.readFile('public/generated/meta.json', 'utf8'))
const questions = JSON.parse(await fs.readFile('public/generated/questions.json', 'utf8'))
const quality = JSON.parse(await fs.readFile('public/generated/quality-report.json', 'utf8'))
const editorialReview = JSON.parse(await fs.readFile('public/generated/questions-editorial-review.json', 'utf8'))
const cases = Number(meta.caseCount || 0)
const expectedTotal = 540
const expectedSets = [
  { subject: 'Procédure civile', prefix: 'PC26-CORR-', count: 120 },
  { subject: 'Procédure civile', prefix: 'PC25-CORR-', count: 180 },
  { subject: 'Droit des obligations', prefix: 'OB26-CORR-', count: 120 },
  { subject: 'Droit social', prefix: 'DS26-CORR-', count: 120 },
]

console.log(`[LexQCM] Banque QCM publiée : ${questions.length} questions.`)
expectedSets.forEach((set) => console.log(`[LexQCM] ${set.subject} (${set.prefix}) : ${questions.filter((q) => q.subject === set.subject && String(q.id).startsWith(set.prefix)).length}.`))
console.log(`[LexQCM] Questions écartées : ${editorialReview.length}.`)
console.log(`[LexQCM] Dossiers progressifs : ${cases}.`)

if (meta.cleanQuestionBase !== true) {
  throw new Error('La banque n’est pas marquée comme base QCM saine.')
}
if (meta.importedFromLegacy !== false) {
  throw new Error('Une source QCM legacy est encore déclarée dans les métadonnées.')
}
if (questions.length !== expectedTotal || Number(meta.questionCount) !== expectedTotal || Number(meta.sourceQuestionCount) !== expectedTotal) {
  throw new Error(`La banque doit contenir exactement ${expectedTotal} questions, ${questions.length} détectées.`)
}
if (editorialReview.length !== 0 || Number(meta.editorialReviewCount) !== 0 || Number(quality.excludedCount) !== 0) {
  throw new Error('Des questions étrangères ou rejetées subsistent dans la banque propre.')
}
if (quality.keptCount !== expectedTotal || quality.inputCount !== expectedTotal) {
  throw new Error(`Le rapport qualité ne correspond pas aux ${expectedTotal} questions du socle.`)
}
for (const set of expectedSets) {
  const matches = questions.filter((q) => q.subject === set.subject && String(q.id).startsWith(set.prefix))
  if (matches.length !== set.count) {
    throw new Error(`Lot ${set.subject} (${set.prefix}) invalide : ${matches.length}/${set.count} questions.`)
  }
}
if (questions.some((q) => !expectedSets.some((set) => q.subject === set.subject && String(q.id).startsWith(set.prefix)))) {
  throw new Error('Une question extérieure aux lots éditoriaux validés a été détectée.')
}
if (new Set(questions.map((q) => q.id)).size !== expectedTotal) {
  throw new Error('Des identifiants QCM sont dupliqués.')
}
if (Number(meta.procedureCivileCorrectionQuestionCount) !== 300 || Number(meta.procedureCivile2025QuestionCount) !== 180 || Number(meta.procedureCivile2026QuestionCount) !== 120) {
  throw new Error('Les métadonnées de procédure civile ne correspondent pas aux lots 2025 et 2026.')
}
if (cases < 30) {
  throw new Error(`Import incomplet des dossiers : seulement ${cases} détectés.`)
}
