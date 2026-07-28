import fs from 'node:fs/promises'
import path from 'node:path'

const generatedDir = path.join(process.cwd(), 'public', 'generated')
const OVERRIDE_VERSION = 1
const OVERRIDES = {
  'PC25-CORR-154': {
    legalRefs: ['CPC, art. 478'],
    status: 'source-explicit',
    verified: {
      status: 'officiel',
      label: 'Légifrance — Code de procédure civile, article 478',
      url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006410740',
    },
  },
  'OB26-CORR-119': {
    legalRefs: ['C. civ., art. 1171'],
    status: 'source-explicit',
    verified: {
      status: 'officiel',
      label: 'Légifrance — Code civil, article 1171',
      url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000036829836',
    },
  },
  'CASE-QCM-dp-theo-07': {
    legalRefs: ['C. civ., art. 1242, al. 5', 'Cass. ass. plén., 19 mai 1988, n° 87-82.654'],
    status: 'case-direct-official',
    verified: {
      status: 'officiel',
      label: 'Légifrance — Assemblée plénière, 19 mai 1988, n° 87-82.654',
      url: 'https://www.legifrance.gouv.fr/juri/id/JURITEXT000007020609/',
    },
  },
}

function stripLegalBlock(value) {
  return String(value || '').replace(/\n\nFondement juridique\s*—[\s\S]*$/u, '').trim()
}

function editorialLabel(source) {
  return String(source?.label || '').replace(/^Source éditoriale\s*:\s*/i, '').replace(/^Visa\s*:[\s\S]*?·\s*Source éditoriale\s*:\s*/i, '').trim()
}

function applyOverride(question, override) {
  const editorialSource = question.editorialSource || question.source || null
  const label = editorialLabel(editorialSource)
  return {
    ...question,
    explanation: `${stripLegalBlock(question.explanation)}\n\nFondement juridique — ${override.legalRefs.join(' ; ')}.`,
    legalRefs: override.legalRefs,
    legalAuthorityStatus: override.status,
    verified: override.verified,
    editorialSource,
    source: {
      ...(editorialSource || {}),
      label: `Visa : ${override.legalRefs.join(' ; ')}${label ? ` · Source éditoriale : ${label}` : ''}`,
      url: override.verified.url,
      kind: 'official',
      verified: 'official',
    },
    officialOverrideVersion: OVERRIDE_VERSION,
  }
}

async function main() {
  const questionsPath = path.join(generatedDir, 'questions.json')
  const metaPath = path.join(generatedDir, 'meta.json')
  const qualityPath = path.join(generatedDir, 'quality-report.json')
  const [questions, meta, quality] = await Promise.all([
    fs.readFile(questionsPath, 'utf8').then(JSON.parse),
    fs.readFile(metaPath, 'utf8').then(JSON.parse),
    fs.readFile(qualityPath, 'utf8').then(JSON.parse),
  ])
  if (!Array.isArray(questions)) throw new Error('Banque invalide avant application des visas officiels.')

  const found = new Set()
  const updated = questions.map((question) => {
    const override = OVERRIDES[question.id]
    if (!override) return question
    found.add(question.id)
    return applyOverride(question, override)
  })
  const missing = Object.keys(OVERRIDES).filter((id) => !found.has(id))
  if (missing.length) throw new Error(`Questions introuvables pour les visas officiels : ${missing.join(', ')}.`)

  await Promise.all([
    fs.writeFile(questionsPath, JSON.stringify(updated)),
    fs.writeFile(metaPath, JSON.stringify({
      ...meta,
      officialLegalOverrideVersion: OVERRIDE_VERSION,
      officialLegalOverrideCount: found.size,
    }, null, 2)),
    fs.writeFile(qualityPath, JSON.stringify({
      ...quality,
      officialLegalOverrides: {
        version: OVERRIDE_VERSION,
        count: found.size,
        ids: [...found],
        policy: 'Références vérifiées manuellement sur Légifrance et appliquées à un identifiant précis.',
      },
    }, null, 2)),
  ])

  console.log(`[LexQCM] Visas officiels ciblés : ${found.size} question(s) complétée(s) avec un lien Légifrance.`)
}

await main()
