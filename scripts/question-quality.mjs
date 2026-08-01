const normalize = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[’‘]/g, "'")
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

const RULES = [
  {
    id: 'article-lookup',
    label: 'Repérage d’un numéro d’article ou d’alinéa',
    test: (text) => [
      /\b(?:dans|par|a) quel(?:le)? article\b/,
      /\bquel(?:le)? (?:est |sont )?(?:le |la |les )?(?:numero d[' ]article|article|alinea|paragraphe)\b/,
      /\b(?:prevu|prevoit|dispose|figure|consacre|mentionne) (?:dans|par) quel(?:le)? article\b/,
      /\bcorrespond a quel(?:le)? article\b/,
      /\bquel article du code\b/,
    ].some((pattern) => pattern.test(text)),
  },
  {
    id: 'document-location',
    label: 'Repérage dans le document, le plan ou la pagination',
    test: (text) => [
      /\ba quelle page\b/,
      /\bdans quelle (?:partie|section|sous-section|sous partie|rubrique)\b/,
      /\bdans quel (?:chapitre|titre|encadre|tableau|paragraphe)\b/,
      /\bsous quel (?:titre|intitule)\b/,
      /\bou (?:se trouve|figure|apparait|est place)\b/,
    ].some((pattern) => pattern.test(text)),
  },
  {
    id: 'verbatim-recall',
    label: 'Mémorisation d’un mot ou d’une formulation exacte',
    test: (text) => [
      /\bquel(?:le)? (?:mot|expression|terme|formulation)\b/,
      /\b(?:mot|expression|terme|formulation) (?:est|sont) (?:ecrit|utilise|employe|mentionne|cite)\b/,
      /\b(?:est|sont) ecrit(?:e|es|s)? (?:dans|a|au)\b/,
      /\breprend mot pour mot\b/,
      /\bformulation exacte\b/,
      /\bcompletez? (?:la|cette) citation\b/,
    ].some((pattern) => pattern.test(text)),
  },
  {
    id: 'trivial-counting',
    label: 'Comptage ou chiffre isolé sans portée juridique',
    test: (text) => [
      /\bcombien de fois\b/,
      /\bcombien (?:de mots|de lignes|de tirets|d'articles|d alineas)\b/,
      /\ble nombre ["«']?\d+["»']? (?:est|apparait|figure|est ecrit|est mentionne)\b/,
      /\bquel nombre (?:est|apparait|figure)\b/,
    ].some((pattern) => pattern.test(text)),
  },
]

function optionsAreReferences(question) {
  const options = Array.isArray(question.options) ? question.options.map(normalize) : []
  if (options.length < 2) return false
  const reference = /^(?:article|art\.?|alinea|§)?\s*[lrdo]?\.?\s*\d{1,5}(?:[-.]\d+)*(?:\s+(?:du|de la)\s+code.*)?$/
  return options.filter((option) => reference.test(option)).length >= Math.ceil(options.length * .75)
}

function optionsAreDocumentLocations(question) {
  const options = Array.isArray(question.options) ? question.options.map(normalize) : []
  if (options.length < 2) return false
  const location = /^(?:page|p\.|partie|section|chapitre|titre|paragraphe)\s*[a-z0-9ivx.-]+$/
  return options.filter((option) => location.test(option)).length >= Math.ceil(options.length * .75)
}

export function classifyQuestion(question) {
  const stem = normalize(question?.stem)
  const reasons = RULES.filter((rule) => rule.test(stem)).map((rule) => ({ id: rule.id, label: rule.label }))

  if (optionsAreReferences(question) && /\b(?:quel|quelle|identifier|correspond|article|alinea)\b/.test(stem)) {
    reasons.push({ id: 'reference-options', label: 'Choix composé presque uniquement de références d’articles' })
  }
  if (optionsAreDocumentLocations(question)) {
    reasons.push({ id: 'location-options', label: 'Choix composé presque uniquement d’emplacements documentaires' })
  }

  const unique = [...new Map(reasons.map((reason) => [reason.id, reason])).values()]
  return {
    excluded: unique.length > 0,
    reasons: unique,
  }
}

export function buildQualityReport(questions) {
  const categories = new Map()
  const subjects = new Map()
  const excluded = []
  const kept = []

  questions.forEach((question) => {
    const classification = classifyQuestion(question)
    if (!classification.excluded) {
      kept.push(question)
      return
    }

    excluded.push({ question, reasons: classification.reasons })
    subjects.set(question.subject || 'Matière inconnue', (subjects.get(question.subject || 'Matière inconnue') || 0) + 1)
    classification.reasons.forEach((reason) => {
      const current = categories.get(reason.id) || { id: reason.id, label: reason.label, count: 0, samples: [] }
      current.count += 1
      if (current.samples.length < 12) {
        current.samples.push({
          id: question.id,
          subject: question.subject,
          topic: question.topic,
          stem: question.stem,
        })
      }
      categories.set(reason.id, current)
    })
  })

  return {
    kept,
    excluded,
    report: {
      generatedAt: new Date().toISOString(),
      inputCount: questions.length,
      keptCount: kept.length,
      excludedCount: excluded.length,
      excludedRate: questions.length ? Math.round((excluded.length / questions.length) * 1000) / 10 : 0,
      categories: [...categories.values()].sort((a, b) => b.count - a.count),
      subjects: [...subjects.entries()].map(([subject, count]) => ({ subject, count })).sort((a, b) => b.count - a.count),
      policy: {
        excluded: [
          'Repérage d’un numéro d’article, d’alinéa ou d’une page',
          'Mémorisation d’un mot ou d’une formulation exacte',
          'Repérage dans le plan ou la structure d’un document',
          'Comptage ou chiffre isolé sans portée juridique',
        ],
        preserved: [
          'Conditions d’application d’une règle',
          'Effets juridiques et sanctions',
          'Qualification de faits',
          'Distinction entre régimes',
          'Délais, seuils et chiffres ayant une conséquence juridique',
          'Questions fondées sur un cas ou une mise en situation',
        ],
      },
    },
  }
}
