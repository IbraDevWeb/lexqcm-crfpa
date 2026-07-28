import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

const root = process.cwd()
const sourceDir = path.join(root, 'data', 'iej-sorbonne-2026')
const configs = {
  social: {
    subject: 'Droit social',
    prefix: 'IEJ26-DS-',
    directory: 'data/generated-iej-sorbonne-droit-social-2026',
    label: 'IEJ de la Sorbonne 2026 — Fascicule de révision et d’actualisation — Droit social',
    asOf: '2026-06-07',
  },
  obligations: {
    subject: 'Droit des obligations',
    prefix: 'IEJ26-OB-',
    directory: 'data/generated-iej-sorbonne-obligations-2026',
    label: 'IEJ de la Sorbonne 2026 — Fascicule de révision et d’actualisation — Droit des obligations',
    asOf: '2026-06-08',
  },
  procedure: {
    subject: 'Procédure civile',
    prefix: 'IEJ26-PC-',
    directory: 'data/generated-iej-sorbonne-procedure-civile-2026',
    label: 'IEJ de la Sorbonne 2026 — Fascicule de révision et d’actualisation — Procédure civile',
    asOf: '2026-06-08',
  },
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

function stableTie(value) {
  return createHash('sha1').update(value).digest('hex')
}

function distractors(record, records, field, salt = '') {
  const correct = record[field]
  const ranked = records
    .filter((other) => other[field] && normalize(other[field]) !== normalize(correct))
    .map((other) => ({
      value: other[field],
      delta: Math.abs(String(other[field]).length - String(correct).length),
      tie: stableTie(`${record.c}|${field}|${salt}|${other.c}`),
    }))
    .sort((left, right) => left.delta - right.delta || left.tie.localeCompare(right.tie))
  const output = []
  const seen = new Set([normalize(correct)])
  for (const candidate of ranked) {
    const key = normalize(candidate.value)
    if (seen.has(key)) continue
    seen.add(key)
    output.push(candidate.value)
    if (output.length === 3) return output
  }
  throw new Error(`Distracteurs insuffisants pour ${record.c} (${field}).`)
}

function common(config, record, id) {
  const editorialLabel = `${config.label} — PDF p. ${record.p}`
  return {
    id,
    subject: config.subject,
    topic: record.s.slice(0, 170),
    difficulty: 2,
    type: 'single',
    mode: 'update',
    legalRefs: [record.c],
    legalAuthorityStatus: 'source-explicit',
    editorialSource: {
      label: editorialLabel,
      kind: 'editorial',
    },
    source: {
      label: `Visa : ${record.c} · Source éditoriale : ${editorialLabel}`,
      kind: 'legal-authority',
      verified: 'source-explicit',
      asOf: config.asOf,
    },
    tags: ['iej-sorbonne', 'fascicule-2026', 'actualisation', 'visa-explicite'],
    active: true,
  }
}

function buildQuestions(config, records) {
  const pairRecords = records.filter((record) => record.a === 1)
  const extraRecords = records.filter((record) => record.e === 1)
  const questions = []
  let counter = 1

  for (const record of pairRecords) {
    const idTheme = `${config.prefix}${String(counter++).padStart(3, '0')}`
    questions.push({
      ...common(config, record, idTheme),
      stem: `Quel thème ou quelle solution le fascicule actualisé 2026 associe-t-il à ${record.c} ?`,
      options: [record.s, ...distractors(record, records, 's')],
      answers: [0],
      explanation: `Le fascicule associe ${record.c} au thème ou à la solution suivante : ${record.s}.\n\nFondement juridique — ${record.c}.`,
      optionExplanations: [
        `Correct : ce thème est rattaché à ${record.c}.`,
        'Ce thème correspond à une autre autorité du fascicule.',
        'Ce thème correspond à une autre autorité du fascicule.',
        'Ce thème correspond à une autre autorité du fascicule.',
      ],
    })

    const idVisa = `${config.prefix}${String(counter++).padStart(3, '0')}`
    questions.push({
      ...common(config, record, idVisa),
      stem: `Quel visa le fascicule actualisé 2026 rattache-t-il au thème ou à la solution suivante : « ${record.s.replace(/[. ]+$/, '')} » ?`,
      options: [record.c, ...distractors(record, records, 'c')],
      answers: [0],
      explanation: `Le visa correspondant est ${record.c}. Le fascicule le présente sous le thème : ${record.s}.\n\nFondement juridique — ${record.c}.`,
      optionExplanations: [
        `Correct : le fascicule rattache ce thème à ${record.c}.`,
        'Cette autorité traite d’un autre point du fascicule.',
        'Cette autorité traite d’un autre point du fascicule.',
        'Cette autorité traite d’un autre point du fascicule.',
      ],
    })
  }

  for (const record of extraRecords) {
    const id = `${config.prefix}${String(counter++).padStart(3, '0')}`
    const base = common(config, record, id)
    questions.push({
      ...base,
      stem: `Selon le fascicule actualisé 2026, quelle proposition restitue la portée juridique de ${record.c} ?`,
      options: [record.s, ...distractors(record, records, 's', 'portee')],
      answers: [0],
      explanation: `La portée retenue dans le fascicule est la suivante : ${record.s}.\n\nFondement juridique — ${record.c}.`,
      optionExplanations: [
        `Correct : cette proposition correspond à la portée attribuée à ${record.c}.`,
        'Cette proposition est rattachée à une autre autorité du fascicule.',
        'Cette proposition est rattachée à une autre autorité du fascicule.',
        'Cette proposition est rattachée à une autre autorité du fascicule.',
      ],
      tags: [...base.tags, 'portee-jurisprudence'],
    })
  }

  if (questions.length !== 120) throw new Error(`${config.subject} : ${questions.length}/120 QCM générés.`)
  if (new Set(questions.map((question) => question.id)).size !== questions.length) throw new Error(`${config.subject} : identifiants dupliqués.`)
  if (new Set(questions.map((question) => normalize(question.stem))).size !== questions.length) throw new Error(`${config.subject} : énoncés dupliqués.`)
  questions.forEach((question) => {
    if (question.options.length !== 4 || new Set(question.options.map(normalize)).size !== 4) throw new Error(`${question.id} : options invalides.`)
    if (question.answers.length !== 1 || question.answers[0] !== 0) throw new Error(`${question.id} : réponse correcte invalide avant mélange.`)
    if (!question.source.label.startsWith('Visa :') || !question.explanation.includes('Fondement juridique')) throw new Error(`${question.id} : source juridique incomplète.`)
  })
  return questions
}

async function readRecords() {
  const entries = (await fs.readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^source-records\.json\.gz\.b64\.part\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'fr'))
  if (!entries.length) throw new Error('Fragments de la source IEJ Sorbonne introuvables.')
  const encodedParts = await Promise.all(entries.map((entry) => fs.readFile(path.join(sourceDir, entry), 'utf8')))
  const encoded = encodedParts.join('').replace(/\s+/g, '')
  return JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'))
}

async function main() {
  const recordsBySubject = await readRecords()
  let total = 0
  for (const [key, config] of Object.entries(configs)) {
    const records = recordsBySubject[key]
    if (!Array.isArray(records)) throw new Error(`Registre source absent pour ${key}.`)
    const questions = buildQuestions(config, records)
    const targetDir = path.join(root, config.directory)
    await fs.rm(targetDir, { recursive: true, force: true })
    await fs.mkdir(targetDir, { recursive: true })
    await fs.writeFile(path.join(targetDir, 'questions.json'), JSON.stringify(questions))
    total += questions.length
    console.log(`[LexQCM] IEJ Sorbonne 2026 — ${config.subject} : ${questions.length} QCM sourcés générés.`)
  }
  if (total !== 360) throw new Error(`Génération IEJ Sorbonne incomplète : ${total}/360.`)
  console.log(`[LexQCM] IEJ Sorbonne 2026 : ${total} QCM sourcés, chacun lié à un visa et à une page PDF.`)
}

await main()
