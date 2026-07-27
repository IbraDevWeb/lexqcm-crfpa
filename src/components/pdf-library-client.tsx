'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'

type StoredPdf = {
  id: string
  name: string
  size: number
  type: string
  addedAt: string
  lastPage: number
  blob: Blob
}

type Course = {
  id: string
  title: string
  provider: string
  pages: number
  topic: string
  tone: 'red' | 'green' | 'orange'
  icon: string
  note: string
}

const DB_NAME = 'lexqcm_private_library_v1'
const STORE = 'pdfs'

const COURSES: Course[] = [
  { id: 'obligations-2026', title: 'Protocoles — Droit des obligations 2026', provider: 'Sauve ton CRFPA', pages: 224, topic: 'Contrats · preuve · responsabilité · quasi-contrats · régime général', tone: 'red', icon: 'OB', note: 'Méthodologie et protocoles de résolution en droit des obligations.' },
  { id: 'responsabilites-2026', title: 'Tableau récapitulatif — Responsabilités civiles', provider: 'Sauve ton CRFPA', pages: 1, topic: 'Panorama des régimes de responsabilité', tone: 'orange', icon: 'RC', note: 'Fiche synthétique des fondements, conditions et exonérations.' },
  { id: 'social-top14-2025', title: 'Droit social — TOP 14 / Protocoles', provider: 'Pré-Barreau', pages: 41, topic: 'Période d’essai · preuve · vie privée · inaptitude · syndicats…', tone: 'green', icon: 'DS', note: 'Support de révision ciblé sur les thèmes importants du droit social.' },
]

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getAll() {
  const db = await openDb()
  return new Promise<StoredPdf[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

async function putPdf(pdf: StoredPdf) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(pdf)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => reject(tx.error)
  })
}

async function removePdf(id: string) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => reject(tx.error)
  })
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} Ko`
  return `${(size / 1024 / 1024).toFixed(size > 10 * 1024 * 1024 ? 0 : 1)} Mo`
}

export function PdfLibraryClient() {
  const [records, setRecords] = useState<StoredPdf[]>([])
  const [active, setActive] = useState<StoredPdf | null>(null)
  const [activeUrl, setActiveUrl] = useState<string>('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')

  const byId = useMemo(() => new Map(records.map((r) => [r.id, r])), [records])

  async function refresh() {
    try { setRecords(await getAll()) } catch { setError('Impossible d’ouvrir le stockage PDF local de ce navigateur.') }
  }

  useEffect(() => { void refresh() }, [])
  useEffect(() => () => { if (activeUrl) URL.revokeObjectURL(activeUrl) }, [activeUrl])

  async function importPdf(event: ChangeEvent<HTMLInputElement>, id?: string) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return setError('Choisis un fichier PDF.')
    setError('')
    try {
      if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false)
      await putPdf({ id: id || `extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: file.name, size: file.size, type: 'application/pdf', addedAt: new Date().toISOString(), lastPage: 1, blob: file })
      await refresh()
    } catch { setError('Impossible d’enregistrer ce PDF sur cet appareil. Vérifie l’espace de stockage disponible.') }
  }

  function open(record: StoredPdf) {
    if (activeUrl) URL.revokeObjectURL(activeUrl)
    const url = URL.createObjectURL(record.blob)
    setActive(record)
    setActiveUrl(url)
    setPage(Math.max(1, record.lastPage || 1))
  }

  async function goToPage(next: number) {
    if (!active) return
    const safe = Math.max(1, Math.floor(next || 1))
    setPage(safe)
    await putPdf({ ...active, lastPage: safe })
    setActive({ ...active, lastPage: safe })
  }

  async function remove(id: string) {
    if (!window.confirm('Supprimer ce PDF de cet appareil ? Le fichier original ne sera pas supprimé.')) return
    if (active?.id === id) { if (activeUrl) URL.revokeObjectURL(activeUrl); setActive(null); setActiveUrl('') }
    await removePdf(id)
    await refresh()
  }

  if (active && activeUrl) {
    const title = COURSES.find((c) => c.id === active.id)?.title || active.name
    return <div className="readerShell readerViewer">
      <div className="readerToolbar"><button className="btn btnGhost" onClick={() => { if (activeUrl) URL.revokeObjectURL(activeUrl); setActive(null); setActiveUrl('') }}>← Bibliothèque</button><div className="readerToolbarTitle"><b>{title}</b><span>{active.name} · {formatSize(active.size)} · privé sur cet appareil</span></div><div className="readerPagebox"><label htmlFor="pdfPage">Page</label><input id="pdfPage" type="number" min={1} value={page} onChange={(e) => setPage(Number(e.target.value))} /><button className="btn btnSoft" onClick={() => void goToPage(page)}>Aller</button></div><button className="btn btnPrimary" onClick={() => window.open(activeUrl, '_blank', 'noopener')}>Plein écran</button></div>
      <div className="pdfFrameWrap"><iframe className="pdfFrame" title={title} src={`${activeUrl}#page=${page}&view=FitH`} /></div><div className="readerNote">Sur certains téléphones, « Plein écran » offre un meilleur confort que l’aperçu intégré.</div>
    </div>
  }

  const extras = records.filter((r) => !COURSES.some((c) => c.id === r.id))
  return <div className="readerShell">
    <div className="top"><div><h1>Cours & PDF</h1><p>Ta bibliothèque privée est conservée localement sur l’appareil. Aucun PDF personnel n’est envoyé vers GitHub, Vercel ou Supabase.</p></div><span className="badge badgeGood">Stockage local</span></div>
    {error && <div className="error">{error}</div>}
    <div className="readerPrivacy"><span>🔒</span><div><b>Bibliothèque privée</b><p>Importe tes supports une fois, puis retrouve-les dans la PWA de cet appareil. Le contenu du PDF ne quitte pas ton navigateur.</p></div></div>
    <div className="readerGrid">{COURSES.map((course) => { const record = byId.get(course.id); return <article className={`readerCard ${course.tone}`} key={course.id}><div className="readerCardTop"><div className="readerIcon">{course.icon}</div>{record ? <span className="localBadge">Disponible sur cet appareil</span> : <span className="badge">À importer</span>}</div><h3>{course.title}</h3><div className="meta"><span className="badge badgeBrand">{course.provider}</span><span className="badge">{course.pages} page{course.pages > 1 ? 's' : ''}</span></div><p>{course.note}</p><strong className="readerTopic">{course.topic}</strong><div className="readerStatus">{record ? <><span>{record.name} · {formatSize(record.size)}</span><button onClick={() => void remove(course.id)}>Supprimer</button></> : <span>Le PDF reste privé sur ton appareil.</span>}</div><div className="readerActions">{record ? <><button className="btn btnPrimary" onClick={() => open(record)}>Lire le cours</button><label className="btn btnGhost fileButton">Remplacer<input type="file" accept="application/pdf,.pdf" onChange={(e) => void importPdf(e, course.id)} /></label></> : <label className="btn btnPrimary fileButton">Importer ce PDF<input type="file" accept="application/pdf,.pdf" onChange={(e) => void importPdf(e, course.id)} /></label>}</div></article> })}</div>
    <div className="readerImport"><h3>Ajouter un autre PDF</h3><p>Tu peux conserver n’importe quel autre support personnel dans LexQCM.</p><label className="btn btnSoft fileButton">Choisir un PDF<input type="file" accept="application/pdf,.pdf" onChange={(e) => void importPdf(e)} /></label></div>
    {extras.length ? <><div className="sectionTitle"><h2>Mes autres PDF</h2></div><div className="readerGrid">{extras.map((record) => <article className="readerCard" key={record.id}><div className="readerCardTop"><div className="readerIcon">PDF</div><span className="localBadge">Local</span></div><h3>{record.name}</h3><p>{formatSize(record.size)} · ajouté le {new Date(record.addedAt).toLocaleDateString('fr-FR')}</p><div className="readerStatus"><span>Document personnel</span><button onClick={() => void remove(record.id)}>Supprimer</button></div><div className="readerActions"><button className="btn btnPrimary" onClick={() => open(record)}>Lire</button></div></article>)}</div></> : null}
  </div>
}
