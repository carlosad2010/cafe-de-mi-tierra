import { createClient } from '@/lib/supabase/server'
import { CuentasCobrarClient } from './CuentasCobrarClient'
import { Caja, CuentaCobrar, Customer, MetodoPago, Product } from '@/lib/types'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

const ESTADOS = ['pendiente', 'pagada', 'anulada'] as const

const CUENTA_SELECT =
  '*, customer:customers(full_name, phone, email), seller:profiles(full_name), order:orders(order_number), items:cuentas_cobrar_items(*)'

/** UUID imposible: fuerza cero resultados cuando la búsqueda no encuentra clientes. */
const NO_MATCH = '00000000-0000-0000-0000-000000000000'

/** Días transcurridos desde una fecha ISO. */
function diasDesde(fecha: string) {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000)
}

export default async function CuentasCobrarPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; estado?: string; q?: string }>
}) {
  const sp     = await searchParams
  const page   = Math.max(1, Number(sp.page) || 1)
  const estado = sp.estado && ESTADOS.includes(sp.estado as any) ? sp.estado : 'todas'
  const q      = (sp.q ?? '').trim()

  const supabase = await createClient()

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

  /** Aplica búsqueda y estado a cualquier consulta sobre `cuentas_cobrar`. */
  function applyFilters(query: any, withEstado: string) {
    let out = query
    if (withEstado !== 'todas') out = out.eq('estado', withEstado)
    if (q && isNumeric)         out = out.eq('numero', Number(q))
    if (customerIds)            out = out.in('customer_id', customerIds)
    return out
  }

  const from = (page - 1) * PAGE_SIZE

  const [cuentasRes, pendientesRes, ...conteoRes] = await Promise.all([
    applyFilters(supabase.from('cuentas_cobrar').select(CUENTA_SELECT, { count: 'exact' }), estado)
      .order('fecha_entrega', { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    // Resumen global (KPIs): independiente de la página y de los filtros
    supabase.from('cuentas_cobrar').select('total, fecha_entrega').eq('estado', 'pendiente'),
    ...ESTADOS.map(e =>
      applyFilters(supabase.from('cuentas_cobrar').select('id', { count: 'exact', head: true }), e),
    ),
  ])

  const [{ data: customers }, { data: products }, { data: cajas }, { data: metodos }] =
    await Promise.all([
      supabase.from('customers').select('*').eq('active', true).order('full_name'),
      supabase
        .from('products')
        .select('*, presentation:presentations(nombre), tipo:tipos_producto(nombre)')
        .eq('active', true)
        .order('name'),
      supabase.from('cajas').select('id, nombre, tipo').eq('activa', true).order('created_at', { ascending: true }),
      supabase.from('metodos_pago').select('*').eq('activo', true).order('orden'),
    ])

  const pendientes = (pendientesRes.data ?? []) as { total: number; fecha_entrega: string }[]
  const masAntigua = pendientes.reduce<string | null>(
    (old, c) => !old || c.fecha_entrega < old ? c.fecha_entrega : old, null)

  const conteos: Record<string, number> = {}
  ESTADOS.forEach((e, i) => { conteos[e] = conteoRes[i]?.count ?? 0 })
  conteos.todas = ESTADOS.reduce((sum, e) => sum + conteos[e], 0)

  return (
    <CuentasCobrarClient
      cuentas={(cuentasRes.data ?? []) as CuentaCobrar[]}
      customers={(customers ?? []) as Customer[]}
      products={(products ?? []) as Product[]}
      cajas={(cajas ?? []) as Pick<Caja, 'id' | 'nombre' | 'tipo'>[]}
      metodosPago={(metodos ?? []) as MetodoPago[]}
      page={page}
      pageSize={PAGE_SIZE}
      total={cuentasRes.count ?? 0}
      estado={estado}
      query={q}
      conteos={conteos}
      resumen={{
        pendientes: pendientes.length,
        totalPendiente: pendientes.reduce((s, c) => s + c.total, 0),
        diasMasAntigua: masAntigua ? diasDesde(masAntigua) : null,
      }}
    />
  )
}
