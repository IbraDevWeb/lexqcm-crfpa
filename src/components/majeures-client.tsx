'use client'

import { useState } from 'react'

type Guide = {
  id: string
  title: string
  subtitle: string
  pages: number
  icon: string
  tone: string
  url: string
  description: string
}

const BASE = 'https://ibradevweb.github.io/lexqcm-crfpa/public-majeures'
const GUIDES: Guide[] = [
  { id: 'obligations', title: 'Majeures types — Droit des obligations', subtitle: '18 constructions modulaires', pages: 20, icon: 'OB', tone: 'red', url: `${BASE}/Majeures_types_Droit_des_obligations_LexQCM.pdf`, description: 'Pourparlers, formation et validité du contrat, inexécution, preuve, responsabilités civiles et régime général des obligations.' },
  { id: 'social', title: 'Majeures types — Droit social', subtitle: '17 constructions modulaires', pages: 19, icon: 'DS', tone: 'green', url: `${BASE}/Majeures_types_Droit_social_LexQCM.pdf`, description: 'Contrat de travail, période d’essai, temps de travail, harcèlement, licenciement, inaptitude, AT/MP et relations collectives.' },
  { id: 'procedure', title: 'Majeures types — Procédure civile', subtitle: '18 constructions modulaires', pages: 20, icon: 'PC', tone: 'blue', url: `${BASE}/Majeures_types_Procedure_civile_LexQCM.pdf`, description: 'Action, compétence, nullités, assignation, contradiction, mise en état, preuve, appel et modes amiables.' },
]

export function MajeuresClient() {
  const [active, setActive] = useState<Guide | null>(null)
  const [page, setPage] = useState(1)

  if (active) {
    const safePage = Math.max(1, Math.min(active.pages, page || 1))
    return <div className="readerShell readerViewer"><div className="readerToolbar"><button className="btn btnGhost" onClick={() => { setActive(null); setPage(1) }}>← Majeures types</button><div className="readerToolbarTitle"><b>{active.title}</b><span>{active.subtitle} · {active.pages} pages · public LexQCM</span></div><div className="readerPagebox"><label htmlFor="majPage">Page</label><input id="majPage" type="number" min={1} max={active.pages} value={page} onChange={(e) => setPage(Number(e.target.value))} /><button className="btn btnSoft" onClick={() => setPage(safePage)}>Aller</button></div><a className="btn btnGhost" href={active.url} download>Télécharger</a><button className="btn btnPrimary" onClick={() => window.open(`${active.url}#page=${safePage}`, '_blank', 'noopener')}>Plein écran</button></div><div className="pdfFrameWrap"><iframe className="pdfFrame" title={active.title} src={`${active.url}#page=${safePage}&view=FitH`} /></div><div className="readerNote">Ces guides sont communs à tous les utilisateurs LexQCM et ne nécessitent aucun import personnel.</div></div>
  }

  return <div className="readerShell"><div className="top"><div><h1>Majeures types</h1><p>Des constructions de majeure prêtes à adapter au cas pratique, conservées depuis la V1.</p></div><span className="badge badgeGood">Bibliothèque publique</span></div><div className="alert info"><b>Comment les utiliser :</b> sélectionne uniquement les règles utiles au problème posé, puis développe ta mineure à partir des faits du sujet.</div><div className="readerGrid">{GUIDES.map((guide) => <article className={`readerCard ${guide.tone}`} key={guide.id}><div className="readerCardTop"><div className="readerIcon">{guide.icon}</div><span className="badge badgeGood">Public LexQCM</span></div><h3>{guide.title}</h3><div className="meta"><span className="badge badgeBrand">{guide.subtitle}</span><span className="badge">{guide.pages} pages</span></div><p>{guide.description}</p><div className="readerStatus"><span>Accessible à tous les utilisateurs</span><span className="localBadge">PDF intégré</span></div><div className="readerActions"><button className="btn btnPrimary" onClick={() => { setActive(guide); setPage(1) }}>Lire</button><a className="btn btnGhost" href={guide.url} download>Télécharger</a></div></article>)}</div></div>
}
