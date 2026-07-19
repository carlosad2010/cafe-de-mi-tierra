import { createClient } from '@/lib/supabase/server'
import { SalesClient } from './SalesClient'

export const dynamic = 'force-dynamic'

export default async function SalesPage() {
  const supabase = await createClient()

  const [{ data: orders }, { data: products }, { data: customers }, { data: metodosPago }] = await Promise.all([
    supabase
      .from('orders')
      .select('*, customer:customers(full_name, phone, email), seller:profiles(full_name), items:order_items(*, product:products(name))')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('products')
      .select('*, presentation:presentations(id, nombre, activa, orden), tipo:tipos_producto(id, nombre, activo, orden)')
      .eq('active', true),
    supabase.from('customers').select('*').eq('active', true).order('full_name'),
    supabase.from('metodos_pago').select('*').eq('activo', true).order('orden'),
  ])

  const sortedProducts = (products ?? []).sort((a: any, b: any) =>
    (a.presentation?.orden ?? 99) - (b.presentation?.orden ?? 99) ||
    (a.tipo?.nombre ?? '').localeCompare(b.tipo?.nombre ?? '')
  )

  return (
    <SalesClient
      initialOrders={orders ?? []}
      products={sortedProducts}
      customers={customers ?? []}
      metodosPago={(metodosPago ?? []) as any}
    />
  )
}
