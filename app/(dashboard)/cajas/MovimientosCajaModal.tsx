'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Caja, MovimientoCaja } from '@/lib/types'
import { formatCOP, formatDateTime } from '@/lib/utils'
import { useEscKey } from '@/lib/hooks/useEscKey'
import {
  X, TrendingUp, TrendingDown, Search, Wallet, Banknote,
  Loader2, Receipt, Flag, ChevronLeft, ChevronRight,
} from 'lucide-react'

type MovimientoDetalle = MovimientoCaja & {
  orden: { order_number: number; customer: { full_name: string } | null } | null
  creator: { full_name: string } | null
  /** Saldo de la caja justo después de aplicar este movimiento */
  saldo: number
}

type CajaWithBalance = Caja & { saldo_actual: number }

const SELECT_FULL = '*, orden:orders(order_number, customer:customers(full_name)), creator:profiles(full_name)'
const SELECT_BASE = '*, orden:orders(order_number, customer:customers(full_name))'

const PAGE_SIZES = [25, 50, 100] as const
/** Tamaño de lote del fetch — evita depender del límite de filas de PostgREST */
const CHUNK = 500

/**
 * Trae todos los movimientos de la caja en lotes. El orden por `id` al final
 * hace determinista el corte entre lotes cuando hay fechas repetidas.
 */
async function fetchMovimientos(
  supabase: ReturnType<typeof createClient>,
  cajaId: string,
  select: string,
): Promise<{ data: any[] | null; error: { message: string } | null }> {
  const all: any[] = []

  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await supabase
      .from('movimientos_caja')
      .select(select)
      .eq('caja_id', cajaId)
      .order('fecha', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + CHUNK - 1)

    if (error) return { data: null, error }
    all.push(...((data ?? []) as any[]))
    if (!data || data.length < CHUNK) break
  }

  return { data: all, error: null }
}

/** [1, '…', 4, 5, 6, '…', 20] */
function pageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const from = Math.max(2, current - 1)
  const to = Math.min(total - 1, current + 1)
  if (from > 2) out.push('…')
  for (let i = from; i <= to; i++) out.push(i)
  if (to < total - 1) out.push('…')
  out.push(total)
  return out
}

export function MovimientosCajaModal({
  caja,
  onClose,
}: {
  caja: CajaWithBalance
  onClose: () => void
}) {
  const [rows, setRows] = useState<MovimientoDetalle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterTipo, setFilterTipo] = useState<'todos' | 'ingreso' | 'egreso'>('todos')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])

  useEscKey(onClose)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    ;(async () => {
      const supabase = createClient()
      let { data, error: err } = await fetchMovimientos(supabase, caja.id, SELECT_FULL)
      // El FK de created_by → profiles puede no estar declarado; reintentar sin ese join
      if (err) ({ data, error: err } = await fetchMovimientos(supabase, caja.id, SELECT_BASE))
      if (cancelled) return

      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }

      // Saldo corrido en orden cronológico, partiendo del saldo inicial de la caja
      let saldo = caja.saldo_inicial
      const conSaldo = ((data ?? []) as any[]).map(m => {
        saldo += m.tipo === 'ingreso' ? m.monto : -m.monto
        return { ...m, creator: m.creator ?? null, saldo } as MovimientoDetalle
      })

      setRows(conSaldo.reverse()) // más reciente primero para mostrar
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [caja.id, caja.saldo_inicial])

  const ingresos = rows.reduce((s, r) => (r.tipo === 'ingreso' ? s + r.monto : s), 0)
  const egresos  = rows.reduce((s, r) => (r.tipo === 'egreso'  ? s + r.monto : s), 0)

  const q = query.trim().toLowerCase()
  const sinFiltros = filterTipo === 'todos' && !q

  const filtered = rows
    .filter(r => filterTipo === 'todos' || r.tipo === filterTipo)
    .filter(r => {
      if (!q) return true
      return [
        r.concepto,
        r.referencia,
        r.orden?.customer?.full_name,
        r.creator?.full_name,
        r.orden?.order_number != null ? `#${r.orden.order_number}` : null,
      ].some(v => v != null && String(v).toLowerCase().includes(q))
    })

  // Volver a la página 1 cuando cambia lo que se está listando
  useEffect(() => { setPage(1) }, [filterTipo, q, pageSize])

  const totalPages  = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)   // por si la página quedó fuera de rango
  const start       = (currentPage - 1) * pageSize
  const visible     = filtered.slice(start, start + pageSize)
  const enUltima    = currentPage === totalPages

  // Al cambiar de página, volver arriba de la tabla
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }) }, [currentPage])

  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <div className="modal-box modal-box-flush flex flex-col"
        style={{ maxWidth: '64rem', maxHeight: '88vh', overflow: 'hidden' }}>

        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: caja.tipo === 'efectivo' ? '#d1fae5' : '#dbeafe' }}>
              {caja.tipo === 'efectivo'
                ? <Banknote size={17} style={{ color: '#065f46' }} />
                : <Wallet size={17} style={{ color: '#1e40af' }} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                Transacciones — {caja.nombre}
              </h2>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {loading ? 'Cargando...' : `${rows.length} ${rows.length === 1 ? 'movimiento' : 'movimientos'} aplicados al saldo`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 shrink-0">
            <X size={16} style={{ color: 'var(--muted-foreground)' }} />
          </button>
        </div>

        {/* ── Resumen: cómo se compone el saldo ──────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px shrink-0"
          style={{ background: 'var(--border)', borderBottom: '1px solid var(--border)' }}>
          <Stat label="Saldo inicial" value={formatCOP(caja.saldo_inicial)} />
          <Stat label="Ingresos" value={`+${formatCOP(ingresos)}`} color="#16a34a" icon={<TrendingUp size={12} />} />
          <Stat label="Egresos" value={`-${formatCOP(egresos)}`} color="#dc2626" icon={<TrendingDown size={12} />} />
          <Stat
            label="Saldo actual"
            value={formatCOP(caja.saldo_inicial + ingresos - egresos)}
            color={caja.saldo_inicial + ingresos - egresos >= 0 ? 'var(--primary)' : '#dc2626'}
            strong
          />
        </div>

        {/* ── Filtros ────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
          <div className="flex gap-1">
            {([
              { key: 'todos', label: 'Todos' },
              { key: 'ingreso', label: 'Ingresos' },
              { key: 'egreso', label: 'Egresos' },
            ] as const).map(opt => (
              <button key={opt.key} onClick={() => setFilterTipo(opt.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: filterTipo === opt.key ? 'var(--primary)' : 'var(--secondary)',
                  color: filterTipo === opt.key ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                }}>
                {opt.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[12rem]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--muted-foreground)' }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por concepto, cliente, factura..."
              className="w-full rounded-lg border pl-9 pr-3 py-1.5 text-xs outline-none"
              style={{ borderColor: 'var(--border)', background: '#fff', color: 'var(--foreground)' }} />
          </div>

        </div>

        {/* ── Tabla ──────────────────────────────────────── */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          {loading ? (
            <div className="py-20 flex flex-col items-center gap-3">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--muted-foreground)' }} />
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Cargando transacciones...</p>
            </div>
          ) : error ? (
            <div className="p-6">
              <p className="text-sm p-3 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <Receipt size={36} className="mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                {rows.length === 0
                  ? 'Esta caja aún no tiene transacciones'
                  : 'Ningún movimiento coincide con el filtro'}
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead className="sticky top-0 z-10">
                <tr>
                  <Th>Fecha</Th>
                  <Th className="hidden sm:table-cell">Tipo</Th>
                  <Th>Concepto</Th>
                  <Th className="hidden md:table-cell">Cliente</Th>
                  <Th className="hidden lg:table-cell">Referencia</Th>
                  <Th className="hidden lg:table-cell">Registró</Th>
                  <Th align="right">Valor</Th>
                  <Th align="right" className="hidden sm:table-cell">Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map(m => {
                  const cliente = m.orden?.customer?.full_name
                  const factura = m.orden?.order_number != null ? `Factura #${m.orden.order_number}` : null
                  return (
                    <tr key={m.id}>
                      <td className="text-xs whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>
                        {formatDateTime(m.fecha ?? m.created_at)}
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="flex items-center gap-1 text-xs font-medium w-fit px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{
                            background: m.tipo === 'ingreso' ? '#d1fae5' : '#fee2e2',
                            color: m.tipo === 'ingreso' ? '#065f46' : '#991b1b',
                          }}>
                          {m.tipo === 'ingreso' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--foreground)' }}>
                        {m.concepto}
                        {/* En móvil el cliente no tiene columna propia */}
                        {cliente && (
                          <span className="block md:hidden text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                            {cliente}
                          </span>
                        )}
                      </td>
                      <td className="text-xs hidden md:table-cell" style={{ color: 'var(--foreground)' }}>
                        {cliente ?? '—'}
                      </td>
                      <td className="text-xs hidden lg:table-cell whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>
                        {factura ?? m.referencia ?? '—'}
                      </td>
                      <td className="text-xs hidden lg:table-cell" style={{ color: 'var(--muted-foreground)' }}>
                        {m.creator?.full_name ?? '—'}
                      </td>
                      <td className="font-semibold text-right whitespace-nowrap" style={{ color: m.tipo === 'ingreso' ? '#16a34a' : '#dc2626' }}>
                        {m.tipo === 'ingreso' ? '+' : '-'}{formatCOP(m.monto)}
                      </td>
                      <td className="text-right whitespace-nowrap hidden sm:table-cell font-medium" style={{ color: m.saldo >= 0 ? 'var(--foreground)' : '#dc2626' }}>
                        {formatCOP(m.saldo)}
                      </td>
                    </tr>
                  )
                })}

                {/* Ancla cronológica: de dónde arrancó el saldo (va al final de todo) */}
                {sinFiltros && enUltima && (
                  <tr style={{ background: 'var(--background)' }}>
                    <td className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {formatDateTime(caja.created_at)}
                    </td>
                    <td className="hidden sm:table-cell">
                      <span className="flex items-center gap-1 text-xs font-medium w-fit px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}>
                        <Flag size={11} /> Apertura
                      </span>
                    </td>
                    <td className="text-xs italic" style={{ color: 'var(--muted-foreground)' }}>
                      Saldo inicial de la caja
                    </td>
                    <td className="hidden md:table-cell" />
                    <td className="hidden lg:table-cell" />
                    <td className="hidden lg:table-cell" />
                    <td className="text-right" />
                    <td className="text-right whitespace-nowrap hidden sm:table-cell font-medium" style={{ color: 'var(--muted-foreground)' }}>
                      {formatCOP(caja.saldo_inicial)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Paginación ─────────────────────────────────── */}
        {!loading && !error && filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-t shrink-0"
            style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>

            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
              <span>
                Mostrando <strong style={{ color: 'var(--foreground)' }}>{start + 1}</strong>
                –<strong style={{ color: 'var(--foreground)' }}>{start + visible.length}</strong>
                {' '}de <strong style={{ color: 'var(--foreground)' }}>{filtered.length}</strong>
                {!sinFiltros && ` (filtrados de ${rows.length})`}
              </span>
              <span className="hidden sm:inline">·</span>
              <label className="hidden sm:flex items-center gap-1.5">
                Por página
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  className="rounded-lg border px-2 py-1 text-xs outline-none"
                  style={{ borderColor: 'var(--border)', background: '#fff', color: 'var(--foreground)' }}>
                  {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <PageBtn
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                  aria-label="Página anterior">
                  <ChevronLeft size={14} />
                </PageBtn>

                {pageList(currentPage, totalPages).map((p, i) =>
                  p === '…' ? (
                    <span key={`gap-${i}`} className="px-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>…</span>
                  ) : (
                    <PageBtn key={p} active={p === currentPage} onClick={() => setPage(p)}>
                      {p}
                    </PageBtn>
                  )
                )}

                <PageBtn
                  disabled={currentPage === totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  aria-label="Página siguiente">
                  <ChevronRight size={14} />
                </PageBtn>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PageBtn({
  children, onClick, active, disabled, ...rest
}: {
  children: React.ReactNode
  onClick?: () => void
  active?: boolean
  disabled?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      onClick={onClick}
      disabled={disabled}
      className="min-w-[1.75rem] h-7 px-2 rounded-lg text-xs font-medium flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: active ? 'var(--primary)' : 'var(--secondary)',
        color: active ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
      }}>
      {children}
    </button>
  )
}

function Stat({
  label, value, color, icon, strong,
}: {
  label: string
  value: string
  color?: string
  icon?: React.ReactNode
  strong?: boolean
}) {
  return (
    <div className="px-5 py-3" style={{ background: '#fff' }}>
      <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide mb-0.5"
        style={{ color: 'var(--muted-foreground)' }}>
        {icon}{label}
      </p>
      <p className={strong ? 'text-lg font-bold' : 'text-base font-semibold'}
        style={{ color: color ?? 'var(--foreground)' }}>
        {value}
      </p>
    </div>
  )
}

function Th({
  children, className = '', align = 'left',
}: {
  children?: React.ReactNode
  className?: string
  align?: 'left' | 'right'
}) {
  return (
    <th className={`${align === 'right' ? 'text-right' : ''} ${className}`}
      style={{ background: 'var(--secondary)' }}>
      {children}
    </th>
  )
}
