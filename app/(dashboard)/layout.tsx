import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { Profile } from '@/lib/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  // getSession() decodifica el JWT localmente (sin llamada de red)
  // El proxy ya verificó la sesión con getUser() antes de llegar aquí
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()

  // Si el perfil no existe, lo creamos automáticamente en lugar de redirigir
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
