import { createClient } from '@/lib/supabase/server'
import { InvoicesClient } from './InvoicesClient'

export default async function InvoicesPage() {
  const supabase = await createClient()

  const { data: orders } = await supabase
    .from('orders')
    .select('*, customer:customers(full_name, phone, email, address, city, document_type, document_number), seller:profiles(full_name), items:order_items(*, product:products(name, presentation:presentations(nombre), tipo:tipos_producto(nombre)))')
    .eq('status', 'completado')
    .order('created_at', { ascending: false })
    .limit(100)

  return <InvoicesClient orders={orders ?? []} />
}
