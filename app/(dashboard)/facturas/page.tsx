import { createClient } from '@/lib/supabase/server'
import { InvoicesClient } from './InvoicesClient'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

const ORDER_SELECT =
  '*, customer:customers(full_name, phone, email, address, city, document_type, document_number), seller:profiles(full_name), items:order_items(*, product:products(name, presentation:presentations(nombre), tipo:tipos_producto(nombre)))'

/** UUID imposible: fuerza cero resultados cuando la búsqueda no encuentra clientes. */
const NO_MATCH = '00000000-0000-0000-0000-000000000000'

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; metodo?: string }>
}) {
  const sp     = await searchParams
  const page   = Math.max(1, Math.floor(Number(sp.page)) || 1)
  const q      = (sp.q ?? '').trim()
  const metodo = (sp.metodo ?? '').trim()

  const supabase = await createClient()

  // La búsqueda es por nombre de cliente, que vive en otra tabla: se resuelve
  // primero a ids para que el filtro y la paginación sean coherentes.
  let customerIds: string[] | null = null
  if (q) {
    const { data } = await supabase
      .from('customers')
      .select('id')
      .ilike('full_name', `%${q}%`)
      .limit(500)
    customerIds = (data ?? []).map(c => c.id)
    if (customerIds.length === 0) customerIds = [NO_MATCH]
  }

  let query = supabase
    .from('orders')
    .select(ORDER_SELECT, { count: 'exact' })
    .eq('status', 'completado')

  if (metodo)      query = query.eq('payment_method', metodo)
  if (customerIds) query = query.in('customer_id', customerIds)

  const from = (page - 1) * PAGE_SIZE
  const { data: orders, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  // Métodos realmente usados en facturas, para no ofrecer filtros vacíos
  const { data: metodosUsados } = await supabase
    .from('orders')
    .select('payment_method')
    .eq('status', 'completado')

  const metodos = Array.from(new Set((metodosUsados ?? []).map(o => o.payment_method))).sort()

  return (
    <InvoicesClient
      orders={orders ?? []}
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? 0}
      query={q}
      metodo={metodo}
      metodos={metodos}
    />
  )
}
