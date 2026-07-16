import { createClient } from '@/lib/supabase/server'
import { InformesClient } from './InformesClient'

export const dynamic = 'force-dynamic'

export default async function InformesPage() {
  const supabase = await createClient()

  const [{ data: orders }, { data: compras }, { data: products }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_number, created_at, total, subtotal, discount, payment_method, customer_id, customer:customers(full_name), seller:profiles(full_name), items:order_items(product_name, product_presentation, product_type, quantity, unit_price, cost_price, subtotal)')
      .eq('status', 'completado')
      .order('created_at', { ascending: true }),
    supabase
      .from('compras')
      .select('id, concepto, proveedor, tipo, monto, fecha')
      .order('fecha', { ascending: true }),
    supabase
      .from('products')
      .select('id, name, cost_price, precio1, precio2, stock, presentation:presentations(nombre), tipo:tipos_producto(nombre)')
      .eq('active', true),
  ])

  return (
    <InformesClient
      orders={(orders ?? []) as any}
      compras={(compras ?? []) as any}
      products={(products ?? []) as any}
    />
  )
}
