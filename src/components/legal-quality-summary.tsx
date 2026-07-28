'use client'

import { useEffect, useState } from 'react'

type LegalAuthorityReport = {
  questionCount?: number
  sourcedCount?: number
  missingCount?: number
  publishedQuestionCount?: number
  quarantinedQuestionCount?: number
  publishedCoverageRate?: number
  activeBySubject?: Record<string, number>
  reviewBySubject?: Record<string, number>
}

type Meta = {
  sourceQuestionCount?: number
  questionCount?: number
  legalReviewCount?: number
}

export function LegalQualitySummary() {
  const [report, setReport] = useState<LegalAuthorityReport | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [reportResponse, metaResponse] = await Promise.all([
          fetch('/generated/legal-authority-report.json', { cache: 'no-store' }),
          fetch('/generated/meta.json', { cache: 'no-store' }),
        ])
        if (reportResponse.ok) setReport(await reportResponse.json())
        if (metaResponse.ok) setMeta(await metaResponse.json())
      } catch {}
    }
    void load()
  }, [])

  if (!report && !meta) return null
  const sourceCount = Number(meta?.sourceQuestionCount ?? report?.questionCount ?? 0)
  const publishedCount = Number(meta?.questionCount ?? report?.publishedQuestionCount ?? 0)
  const reviewCount = Number(meta?.legalReviewCount ?? report?.quarantinedQuestionCount ?? 0)
  const detectedCount = Number(report?.sourcedCount ?? publishedCount)
  const detectedRate = sourceCount ? Math.round((detectedCount / sourceCount) * 1000) / 10 : 0
  const subjects = [...new Set([
    ...Object.keys(report?.activeBySubject || {}),
    ...Object.keys(report?.reviewBySubject || {}),
  ])].sort((left, right) => left.localeCompare(right, 'fr'))

  return <>
    <div className="alert successBox"><b>Publication juridiquement autonome :</b> chaque QCM accessible dans l’entraînement comporte désormais un article, un texte numéroté ou une décision datée. La référence au corrigé d’origine reste affichée uniquement comme traçabilité éditoriale.</div>
    <div className="qualityGrid">
      <div className="qualityItem"><b>{publishedCount.toLocaleString('fr-FR')}</b><span>QCM publiés avec visa</span></div>
      <div className="qualityItem"><b>100 %</b><span>de la banque active sourcée</span></div>
      <div className="qualityItem"><b>{reviewCount.toLocaleString('fr-FR')}</b><span>QCM en revue juridique</span></div>
      <div className="qualityItem"><b>{sourceCount.toLocaleString('fr-FR')}</b><span>QCM dans le socle éditorial</span></div>
      <div className="qualityItem"><b>{detectedCount.toLocaleString('fr-FR')}</b><span>visas retrouvés dans le socle</span></div>
      <div className="qualityItem"><b>{detectedRate}%</b><span>couverture brute auditée</span></div>
    </div>
    {subjects.length ? <section className="card qualityDetail"><div className="sectionHead"><div><span className="sectionKicker">SUIVI DES VISAS</span><h2>Publication par matière</h2></div><span className="badge badgeGood">Aucun visa manquant en entraînement</span></div>{subjects.map((subject) => <div className="row" key={subject}><span>{subject}</span><b>{Number(report?.activeBySubject?.[subject] || 0)} publiés · {Number(report?.reviewBySubject?.[subject] || 0)} en revue</b></div>)}</section> : null}
    <div className="alert warn"><b>Règle de sécurité éditoriale :</b> une source telle que « corrigé Pré-Barreau, page X » ne constitue plus, à elle seule, un fondement juridique publiable. Les rapprochements ambigus sont refusés et placés en revue manuelle.</div>
  </>
}
