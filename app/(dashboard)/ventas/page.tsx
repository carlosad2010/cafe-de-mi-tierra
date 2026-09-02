import { createClient } from '@/lib/supabase/server'
import { SalesClient } from './SalesClient'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

const ORDER_SELECT =
  '*, customer:customers(full_name, phone, email), seller:profiles(full_name), items:order_items(*, product:products(name))'

const STATUSES = ['pendiente', 'completado', 'cancelado'] as const

/** UUID imposible: fuerza cero resultados cuando la búsqueda no encuentra clientes. */
const NO_MATCH = '00000000-0000-0000-0000-000000000000'

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>
}) {
  const sp     = await searchParams
  const page   = Math.max(1, Number(sp.page) || 1)
  const status = sp.status && STATUSES.includes(sp.status as any) ? sp.status : 'todos'
  const q      = (sp.q ?? '').trim()

  const supabase = await createClient()

  // La búsqueda por texto se resuelve contra clientes; la numérica, contra el
  // número de pedido. Ambas se aplican en el servidor para que la paginación
  // sea coherente con el filtro.
  const isNumeric = /^\d+$/.test(q)
  let customerIds: string[] | null = null
  if (q && !isNumeric) {
    const { data } = await supabase
      .from('customers')
      .select('id')
      .ilike('full_name', `%${q}%`)
      .limit(500)
    customerIds = (data ?? []).map(c => c.id)
    if (customerIds.length === 0) customerIds = [NO_MATCH]
  }

  /** Aplica los filtros activos a cualquier consulta sobre `orders`. */
  function applyFilters<T extends { eq: any; in: any }>(query: T, withStatus: string | null): T {
    let out: any = query
    if (withStatus && withStatus !== 'todos') out = out.eq('status', withStatus)
    if (q && isNumeric) out = out.eq('order_number', Number(q))
    if (customerIds) out = out.in('customer_id', customerIds)
    return out
  }

  const from = (page - 1) * PAGE_SIZE

  const [ordersRes, ...countRes] = await Promise.all([
    applyFilters(
      supabase.from('orders').select(ORDER_SELECT, { count: 'exact' }),
      status,
    ).order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1),
    ...STATUSES.map(s =>
      applyFilters(supabase.from('orders').select('id', { count: 'exact', head: true }), s),
    ),
  ])

  const [{ data: products }, { data: customers }, { data: metodosPago }] = await Promise.all([
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

  const statusCounts: Record<string, number> = {}
  STATUSES.forEach((s, i) => { statusCounts[s] = countRes[i]?.count ?? 0 })
  statusCounts.todos = STATUSES.reduce((sum, s) => sum + statusCounts[s], 0)

  return (
    <SalesClient
      initialOrders={ordersRes.data ?? []}
      products={sortedProducts}
      customers={customers ?? []}
      metodosPago={(metodosPago ?? []) as any}
      page={page}
      pageSize={PAGE_SIZE}
      total={ordersRes.count ?? 0}
      status={status}
      query={q}
      statusCounts={statusCounts}
    />
  )
}
