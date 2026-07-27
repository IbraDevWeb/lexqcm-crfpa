import { Suspense } from 'react'
import { AuthForm } from '@/components/auth-form'

export const metadata = { title: 'Créer un compte' }

export default function SignUpPage() {
  return <Suspense fallback={<div className="authWrap"><div className="spinner" /></div>}><AuthForm mode="signup" /></Suspense>
}
