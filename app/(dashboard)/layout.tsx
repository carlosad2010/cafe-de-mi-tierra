import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { Profile } from '@/lib/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()

  if (!profile) {
    await supabase.from('profiles').insert({
      id: session.user.id,
      email: session.user.email!,
      full_name: session.user.email!,
      role: 'seller',
    })
    const { data: newProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()

    if (!newProfile) redirect('/login')

    return <AppShell profile={newProfile as Profile}>{children}</AppShell>
  }

  return <AppShell profile={profile as Profile}>{children}</AppShell>
}
