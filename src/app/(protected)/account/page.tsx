import { AccountClient } from '@/components/account-client'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Mon compte' }

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user!.id).maybeSingle()

  return <>
    <div className="top"><div><h1>Mon compte</h1><p>Gère ton profil et tes données LexQCM.</p></div></div>
    <AccountClient initialName={profile?.display_name ?? ''} email={user?.email ?? ''} />
  </>
}
