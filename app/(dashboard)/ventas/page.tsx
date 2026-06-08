import { createClient } from '@/lib/supabase/server'
import { SalesClient } from './SalesClient'

export default async function SalesPage() {
  const supabase = await createClient()

  const [{ data: orders }, { data: products }, { data: customers }] = await Promise.all([
    supabase
      .from('orders')
      .select('*, customer:customers(full_name, phone, email), seller:profiles(full_name), items:order_items(*, product:products(name))')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('products').select('*').eq('active', true).order('presentation').order('type'),
    supabase.from('customers').select('*').eq('active', true).order('full_name'),
  ])

  return (
    <SalesClient
      initialOrders={orders ?? []}
      products={products ?? []}
      customers={customers ?? []}
    />
  )
}
