import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { Profile } from '@/lib/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  // getUser() revalida contra el servidor de Auth; getSession() sólo lee la
  // cookie sin verificarla, y este layout es el único control de acceso de
  // once de las doce páginas del panel.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    await supabase.from('profiles').insert({
      id: user.id,
      email: user.email!,
      full_name: user.email!,
      role: 'seller',
    })
    const { data: newProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!newProfile) redirect('/login')

    return <AppShell profile={newProfile as Profile}>{children}</AppShell>
  }

  // Un usuario desactivado desde /usuarios no debe seguir viendo datos con
  // una sesión que ya tenía abierta: se cierra aquí en cuanto vuelve a
  // navegar, en vez de quedarse con acceso indefinido hasta que expire el
  // token por su cuenta.
  if (profile.active === false) {
    await supabase.auth.signOut()
    redirect('/login?error=inactive')
  }

  return <AppShell profile={profile as Profile}>{children}</AppShell>
}
