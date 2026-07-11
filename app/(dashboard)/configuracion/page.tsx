import { createClient } from '@/lib/supabase/server'
import { ConfiguracionClient } from './ConfiguracionClient'

export const dynamic = 'force-dynamic'

export default async function ConfiguracionPage() {
  const supabase = await createClient()

  const [
    { data: presentations },
    { data: tiposProducto },
    { data: config },
  ] = await Promise.all([
    supabase.from('presentations').select('*').order('orden'),
    supabase.from('tipos_producto').select('*').order('orden'),
    supabase.from('configuracion').select('*').maybeSingle(),
  ])

  return (
    <ConfiguracionClient
      initialPresentations={presentations ?? []}
      initialTipos={tiposProducto ?? []}
      config={config}
    />
  )
}
