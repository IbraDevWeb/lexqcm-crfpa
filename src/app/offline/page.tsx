import Link from 'next/link'

export const metadata = { title: 'Hors connexion' }

export default function OfflinePage() {
  return <div className="authWrap"><div className="authCard"><div className="logo" style={{ color: '#111827' }}>Lex<span>QCM</span></div><h1>Tu es hors connexion</h1><p>Les questions déjà mises en cache restent disponibles. La progression sera resynchronisée dès que le réseau reviendra.</p><div className="actions"><Link className="btn btnPrimary" href="/train">Ouvrir l’entraînement</Link><Link className="btn btnGhost" href="/dashboard">Tableau de bord</Link></div></div></div>
}
