import { createClient } from '@/lib/supabase/server'
import { ComisionesClient } from './ComisionesClient'

export const dynamic = 'force-dynamic'

export default async function ComisionesPage() {
  const supabase = await createClient()

  const [{ data: orders }, { data: presentaciones }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_number, created_at, total, seller:profiles(id, full_name), items:order_items(product_presentation, quantity, comision_unitaria)')
      .eq('status', 'completado')
      .order('created_at', { ascending: true }),
    supabase
      .from('presentations')
      .select('nombre, comision')
      .is('comision', null)
      .eq('activa', true),
  ])

  return (
    <ComisionesClient
      orders={(orders ?? []) as any}
      presentacionesSinTarifa={(presentaciones ?? []).map(p => p.nombre)}
    />
  )
}
