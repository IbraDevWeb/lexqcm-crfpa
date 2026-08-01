import { Suspense } from 'react'
import { AuthForm } from '@/components/auth-form'

export const metadata = { title: 'Connexion' }

export default function LoginPage() {
  return <Suspense fallback={<div className="authWrap"><div className="spinner" /></div>}><AuthForm mode="login" /></Suspense>
}
