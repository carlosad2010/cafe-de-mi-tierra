import { createClient } from '@/lib/supabase/server'
import { ComprasClient } from './ComprasClient'
import { Caja, Compra } from '@/lib/types'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

const TIPOS = ['compra', 'gasto'] as const

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tipo?: string; q?: string }>
}) {
  const sp   = await searchParams
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1)
  const tipo = sp.tipo && TIPOS.includes(sp.tipo as any) ? sp.tipo : 'todos'
  // El termino se limpia porque abajo viaja dentro de .or(), donde
  // supabase-js NO escapa los valores: una coma o un parentesis podrian
  // alterar la consulta. Solo se dejan pasar letras, digitos y espacios.
  const q    = (sp.q ?? '').trim().replace(/[^\p{L}\p{N} ]/gu, '').slice(0, 60)

  const supabase = await createClient()

  /** Aplica búsqueda y tipo a cualquier consulta sobre `compras`. */
  function applyFilters(query: any, withTipo: string) {
    let out = query
    if (withTipo !== 'todos') out = out.eq('tipo', withTipo)
    if (q) out = out.or(`concepto.ilike.*${q}*,proveedor.ilike.*${q}*`)
    return out
  }

  const from = (page - 1) * PAGE_SIZE

  const [comprasRes, resumenRes, { data: cajas }] = await Promise.all([
    applyFilters(
      supabase
        .from('compras')
        .select('*, caja:cajas(nombre, tipo), creator:profiles(full_name)', { count: 'exact' }),
      tipo,
    )
      .order('fecha', { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    // Totales del encabezado: sobre todos los registros, no sobre la página
    supabase.from('compras').select('tipo, monto, caja:cajas(tipo)'),
    supabase
      .from('cajas')
      .select('id, nombre, tipo')
      .eq('activa', true)
      .order('created_at', { ascending: true }),
  ])

  const todas = (resumenRes.data ?? []) as any[]
  const suma = (pred: (c: any) => boolean) =>
    todas.filter(pred).reduce((s, c) => s + (c.monto ?? 0), 0)

  const resumen = {
    compras:  suma(c => c.tipo === 'compra'),
    gastos:   suma(c => c.tipo === 'gasto'),
    efectivo: suma(c => c.caja?.tipo === 'efectivo'),
    bancaria: suma(c => c.caja?.tipo === 'bancaria'),
    registros: todas.length,
  }

  const conteos: Record<string, number> = { todos: todas.length }
  for (const t of TIPOS) conteos[t] = todas.filter(c => c.tipo === t).length

  return (
    <ComprasClient
      compras={(comprasRes.data ?? []) as Compra[]}
      cajas={(cajas ?? []) as Pick<Caja, 'id' | 'nombre' | 'tipo'>[]}
      page={page}
      pageSize={PAGE_SIZE}
      total={comprasRes.count ?? 0}
      tipo={tipo}
      query={q}
      conteos={conteos}
      resumen={resumen}
    />
  )
}
