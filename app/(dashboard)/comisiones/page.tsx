import { createClient } from '@/lib/supabase/server'
import { ComisionesClient } from './ComisionesClient'

export const dynamic = 'force-dynamic'

export default async function ComisionesPage() {
  const supabase = await createClient()

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, created_at, total, seller:profiles(id, full_name), items:order_items(product_presentation, quantity)')
    .eq('status', 'completado')
    .order('created_at', { ascending: true })

  return <ComisionesClient orders={(orders ?? []) as any} />
}
