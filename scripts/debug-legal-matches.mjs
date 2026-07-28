import fs from 'node:fs/promises'

const questions = JSON.parse(await fs.readFile('public/generated/questions.json', 'utf8'))
const cases = JSON.parse(await fs.readFile('public/generated/cases.json', 'utf8'))

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase()
}
function tokens(value) { return new Set(normalize(value).split(' ').filter((token) => token.length >= 3)) }
function jaccard(a, b) {
  const left = tokens(a); const right = tokens(b)
  if (!left.size || !right.size) return 0
  let common = 0; left.forEach((token) => { if (right.has(token)) common += 1 })
  return common / (left.size + right.size - common)
}
function answerText(q) { return (q.answers || []).map((index) => q.options?.[index]).filter(Boolean).join(' ') }

const candidates = cases.flatMap((dossier) => (dossier.questions || []).filter((q) => q.legalRefs?.length).map((q) => ({
  id: q.id, subject: dossier.subject, topic: dossier.topic, stem: q.stem, explanation: q.explanation, answer: answerText(q), refs: q.legalRefs, source: q.source?.label || dossier.source?.label || '',
})))

const sampleIds = ['PC26-CORR-001','PC26-CORR-002','PC26-CORR-003','PC26-CORR-010','PC26-CORR-040','OB26-CORR-001','OB26-CORR-020','DS26-CORR-001','DS26-CORR-020','PC25-CORR-001']
for (const id of sampleIds) {
  const question = questions.find((q) => q.id === id)
  if (!question) continue
  const ranked = candidates.filter((c) => normalize(c.subject) === normalize(question.subject)).map((candidate) => {
    const stem = jaccard(question.stem, candidate.stem)
    const explanation = jaccard(question.explanation, candidate.explanation)
    const answer = jaccard(answerText(question), candidate.answer)
    const topic = jaccard(question.topic, candidate.topic)
    return { candidate, score: stem * .45 + explanation * .3 + answer * .15 + topic * .1, stem, explanation, answer, topic }
  }).sort((a, b) => b.score - a.score).slice(0, 3)
  console.log(`\n[LEGAL DEBUG] ${id} | ${question.topic} | ${question.stem}`)
  ranked.forEach((entry) => console.log(JSON.stringify({ id: entry.candidate.id, score: Number(entry.score.toFixed(3)), stem: Number(entry.stem.toFixed(3)), explanation: Number(entry.explanation.toFixed(3)), answer: Number(entry.answer.toFixed(3)), topic: Number(entry.topic.toFixed(3)), refs: entry.candidate.refs, source: entry.candidate.source })))
}
