import { requireAdmin } from '@/lib/supabase/server'
import { ConfiguracionClient } from './ConfiguracionClient'

export const dynamic = 'force-dynamic'

export default async function ConfiguracionPage() {
  // Sólo estaba oculta en el menú: un vendedor que escribiera la URL entraba
  // y podía cambiar los datos fiscales del negocio, porque RLS le permite
  // escribir aquí (sólo bloquea al rol 'consulta').
  const supabase = await requireAdmin()

  const [
    { data: presentations },
    { data: tiposProducto },
    { data: metodosPago },
    { data: config },
  ] = await Promise.all([
    supabase.from('presentations').select('*').order('orden'),
    supabase.from('tipos_producto').select('*').order('orden'),
    supabase.from('metodos_pago').select('*').order('orden'),
    supabase.from('configuracion').select('*').maybeSingle(),
  ])

  return (
    <ConfiguracionClient
      initialPresentations={presentations ?? []}
      initialTipos={tiposProducto ?? []}
      initialMetodosPago={metodosPago ?? []}
      config={config}
    />
  )
}
