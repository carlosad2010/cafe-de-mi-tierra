import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { Profile } from '@/lib/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  const userId = session.user.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (!profile) {
    await supabase.from('profiles').insert({
      id: userId,
      email: session.user.email!,
      full_name: session.user.email!,
      role: 'seller',
    })
    const { data: newProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!newProfile) redirect('/login')

    return (
      <div className="flex min-h-screen">
        <Sidebar profile={newProfile as Profile} />
        <main className="flex-1 overflow-auto" style={{ background: 'var(--background)' }}>
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar profile={profile as Profile} />
      <main className="flex-1 overflow-auto" style={{ background: 'var(--background)' }}>
        {children}
      </main>
    </div>
  )
}
