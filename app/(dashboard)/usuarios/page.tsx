import { requireAdmin } from '@/lib/supabase/server'
import { UsersClient } from './UsersClient'

export default async function UsersPage() {
  const supabase = await requireAdmin()

  const { data: profiles } = await supabase
    .from('profiles').select('*').order('full_name')

  return <UsersClient initialProfiles={profiles ?? []} />
}
