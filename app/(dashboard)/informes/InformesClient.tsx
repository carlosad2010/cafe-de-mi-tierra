'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { formatCOP } from '@/lib/utils'
import { Download, TrendingUp, TrendingDown } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type OrderReport = {
  id: string; order_number: number; created_at: string
  total: number; subtotal: number; discount: number; payment_method: string
  customer?: { full_name: string } | null
  seller?: { full_name: string } | null
  items: { product_name: string; quantity: number; unit_price: number; cost_price: number; subtotal: number }[]
}
type CompraReport = {
  id: string; concepto: string; proveedor: string | null
  tipo: 'compra' | 'gasto'; monto: number; fecha: string
}
type ProductReport = {
  id: string; name: string
  presentation?: { nombre: string } | null
  tipo?: { nombre: string } | null
  cost_price: number; precio1: number; precio2: number; stock: number
}

type Period = '7d' | '30d' | '90d' | '180d' | '365d' | 'all'
type Tab    = 'resumen' | 'ventas' | 'clientes' | 'compras' | 'rentabilidad'

// ─── Constants ────────────────────────────────────────────────
const PERIODS: { key: Period; label: string }[] = [
  { key: '7d',   label: '7 días'   },
  { key: '30d',  label: '30 días'  },
  { key: '90d',  label: '3 meses'  },
  { key: '180d', label: '6 meses'  },
  { key: '365d', label: '1 año'    },
  { key: 'all',  label: 'Todo'     },
]

const TABS: { key: Tab; label: string }[] = [
  { key: 'resumen',      label: 'Resumen'          },
  { key: 'ventas',       label: 'Ventas'            },
  { key: 'clientes',     label: 'Clientes'          },
  { key: 'compras',      label: 'Compras & Gastos'  },
  { key: 'rentabilidad', label: 'Rentabilidad'      },
]

const COLORS = ['#8B5C2A', '#3B82F6', '#22C55E', '#EF4444', '#A855F7', '#F97316', '#14B8A6', '#EC4899']

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia',
  tarjeta: 'Tarjeta', nequi: 'Nequi', daviplata: 'Daviplata', otro: 'Otro',
}

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// ─── Helpers ──────────────────────────────────────────────────
function getCutoff(period: Period): Date {
  if (period === 'all') return new Date(0)
  const days: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365 }
  const d = new Date()
  d.setDate(d.getDate() - days[period])
  d.setHours(0, 0, 0, 0)
  return d
}

function groupByTime(orders: OrderReport[], period: Period) {
  const byMonth = period === '365d' || period === 'all'
  const byWeek  = period === '90d'  || period === '180d'
  const map = new Map<string, { label: string; total: number; profit: number; count: number }>()

  orders.forEach(o => {
    const d = new Date(o.created_at)
    let key: string, label: string

    if (byMonth) {
      key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
    } else if (byWeek) {
      const day  = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const mon  = new Date(d); mon.setDate(diff)
      key   = mon.toISOString().slice(0, 10)
      label = `Sem ${mon.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })}`
    } else {
      key   = d.toISOString().slice(0, 10)
      label = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
    }

    const cost   = o.items.reduce((s, i) => s + i.cost_price * i.quantity, 0)
    const profit = o.total - cost
    const ex     = map.get(key)
    if (ex) { ex.total += o.total; ex.profit += profit; ex.count++ }
    else     map.set(key, { label, total: o.total, profit, count: 1 })
  })

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
}

function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return
  const headers = Object.keys(data[0])
  const rows = data.map(row =>
    headers.map(h => {
      const v = row[h]
      return typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : String(v ?? '')
    }).join(',')
  )
  const csv  = '﻿' + [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Sub-components ───────────────────────────────────────────
function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: '#1C1917' }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: '#A8A29E' }}>{label}</span>
      </div>
      <p className="text-2xl font-bold mb-1" style={{ color: '#FFF8F0', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <p className="text-xs" style={{ color: '#57534E' }}>{sub}</p>
    </div>
  )
}

function MarginBadge({ value }: { value: number }) {
  const color = value >= 50 ? '#16A34A' : value >= 30 ? '#CA8A04' : '#DC2626'
  const bg    = value >= 50 ? '#DCFCE7' : value >= 30 ? '#FEF9C3' : '#FEE2E2'
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: bg, color }}>
      {value.toFixed(1)}%
    </span>
  )
}

function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
      style={{ borderColor: '#E7E5E4', color: '#78716C' }}>
      <Download size={13} /> CSV
    </button>
  )
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: '#fff', borderColor: '#E7E5E4' }}>
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#F5F5F4' }}>
        <h3 className="text-sm font-semibold" style={{ color: '#1C1917' }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

const tooltipStyle = { borderRadius: '8px', border: '1px solid #E7E5E4', fontSize: 12, background: '#fff' }

// ─── Main component ───────────────────────────────────────────
export function InformesClient({
  orders, compras, products,
}: {
  orders: OrderReport[]
  compras: CompraReport[]
  products: ProductReport[]
}) {
  const [period, setPeriod] = useState<Period>('30d')
  const [tab,    setTab]    = useState<Tab>('resumen')

  const cutoff = useMemo(() => getCutoff(period), [period])

  const filteredOrders = useMemo(
    () => orders.filter(o => new Date(o.created_at) >= cutoff),
    [orders, cutoff]
  )
  const filteredCompras = useMemo(
    () => compras.filter(c => new Date(c.fecha) >= cutoff),
    [compras, cutoff]
  )

  // ── KPIs
  const kpis = useMemo(() => {
    const ingresos = filteredOrders.reduce((s, o) => s + o.total, 0)
    const costo    = filteredOrders.reduce((s, o) => s + o.items.reduce((si, i) => si + i.cost_price * i.quantity, 0), 0)
    const pedidos  = filteredOrders.length
    const ticket   = pedidos > 0 ? ingresos / pedidos : 0
    const margen   = ingresos > 0 ? ((ingresos - costo) / ingresos) * 100 : 0
    const gastos   = filteredCompras.reduce((s, c) => s + c.monto, 0)
    return { ingresos, costo, pedidos, ticket, margen, gastos, utilidad: ingresos - costo - gastos }
  }, [filteredOrders, filteredCompras])

  // ── Time series
  const timeSeries = useMemo(() => groupByTime(filteredOrders, period), [filteredOrders, period])

  // ── Payment breakdown
  const paymentData = useMemo(() => {
    const map = new Map<string, number>()
    filteredOrders.forEach(o => map.set(o.payment_method, (map.get(o.payment_method) ?? 0) + o.total))
    return Array.from(map.entries())
      .map(([k, v]) => ({ name: PAYMENT_LABELS[k] ?? k, value: v }))
      .sort((a, b) => b.value - a.value)
  }, [filteredOrders])

  // ── Top products
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; cost: number }>()
    filteredOrders.forEach(o => o.items.forEach(i => {
      const ex = map.get(i.product_name)
      if (ex) { ex.qty += i.quantity; ex.revenue += i.subtotal; ex.cost += i.cost_price * i.quantity }
      else     map.set(i.product_name, { name: i.product_name, qty: i.quantity, revenue: i.subtotal, cost: i.cost_price * i.quantity })
    }))
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map(p => ({ ...p, margin: p.revenue > 0 ? (p.revenue - p.cost) / p.revenue * 100 : 0 }))
  }, [filteredOrders])

  // ── Top clients
  const topClients = useMemo(() => {
    const map = new Map<string, { name: string; orders: number; total: number }>()
    filteredOrders.forEach(o => {
      const key = o.customer?.full_name ?? 'Sin cliente'
      const ex  = map.get(key)
      if (ex) { ex.orders++; ex.total += o.total }
      else     map.set(key, { name: key, orders: 1, total: o.total })
    })
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10)
  }, [filteredOrders])

  // ── Compras breakdown
  const comprasTotals = useMemo(() => ({
    compras: filteredCompras.filter(c => c.tipo === 'compra').reduce((s, c) => s + c.monto, 0),
    gastos:  filteredCompras.filter(c => c.tipo === 'gasto').reduce((s, c) => s + c.monto, 0),
  }), [filteredCompras])

  const comprasPieData = useMemo(() => [
    { name: 'Compras (inventario)', value: comprasTotals.compras },
    { name: 'Gastos operativos',    value: comprasTotals.gastos  },
  ], [comprasTotals])

  // ── Rentabilidad (catalog-level, no period filter)
  const rentabilidadData = useMemo(() =>
    products.map(p => {
      const label = `${p.presentation?.nombre ?? ''} ${p.tipo?.nombre ?? ''}`.trim() || p.name
      return {
        name: label,
        costo: p.cost_price, precio1: p.precio1, precio2: p.precio2, stock: p.stock,
        margenP1: p.precio1 > 0 ? (p.precio1 - p.cost_price) / p.precio1 * 100 : 0,
        margenP2: p.precio2 > 0 ? (p.precio2 - p.cost_price) / p.precio2 * 100 : 0,
        gananciaP1: p.precio1 - p.cost_price,
        gananciaP2: p.precio2 - p.cost_price,
      }
    }).sort((a, b) => b.margenP1 - a.margenP1),
  [products])

  return (
    <div className="p-6 space-y-6" style={{ background: '#F5F0EB', minHeight: '100vh' }}>

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1C1917' }}>Informes & Analytics</h1>
          <p className="text-sm mt-0.5" style={{ color: '#78716C' }}>
            {filteredOrders.length} ventas completadas · datos en tiempo real
          </p>
        </div>
        {/* Period selector */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#E7E4DF' }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={period === p.key
                ? { background: '#1C1917', color: '#FFF8F0' }
                : { color: '#78716C' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Ingresos totales" value={formatCOP(kpis.ingresos)} sub={`${kpis.pedidos} pedidos completados`} accent="#8B5C2A" />
        <KpiCard label="Ticket promedio"  value={formatCOP(kpis.ticket)}   sub="Por pedido"                             accent="#3B82F6" />
        <KpiCard label="Margen bruto"     value={`${kpis.margen.toFixed(1)}%`} sub={`Ganancia: ${formatCOP(kpis.ingresos - kpis.costo)}`} accent="#22C55E" />
        <KpiCard label="Utilidad neta"
          value={formatCOP(kpis.utilidad)}
          sub={`Después de gastos: ${formatCOP(kpis.gastos)}`}
          accent={kpis.utilidad >= 0 ? '#22C55E' : '#EF4444'} />
      </div>

      {/* ── Tab bar ───────────────────────────────────────────── */}
      <div className="flex gap-1 border-b" style={{ borderColor: '#D6D3D1' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap"
            style={{ color: tab === t.key ? '#1C1917' : '#78716C' }}>
            {t.label}
            {tab === t.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                style={{ background: '#8B5C2A' }} />
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* Tab: RESUMEN                                          */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'resumen' && (
        <div className="space-y-4">
          {/* Area chart */}
          <SectionCard title="Ingresos y ganancia en el tiempo"
            action={<CsvButton onClick={() => downloadCSV(
              timeSeries.map(t => ({ Periodo: t.label, Ingresos: t.total, Ganancia: t.profit, Pedidos: t.count })),
              'ventas-tiempo.csv'
            )} />}>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={timeSeries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#8B5C2A" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#8B5C2A" stopOpacity={0}    />
                    </linearGradient>
                    <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22C55E" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#A8A29E' }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#A8A29E' }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip
                    formatter={(v, name) => [formatCOP(v as number), (name as string) === 'total' ? 'Ingresos' : 'Ganancia']}
                    contentStyle={tooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }}
                    formatter={v => v === 'total' ? 'Ingresos' : 'Ganancia bruta'} />
                  <Area type="monotone" dataKey="total"  stroke="#8B5C2A" strokeWidth={2} fill="url(#gradTotal)"  name="total"  />
                  <Area type="monotone" dataKey="profit" stroke="#22C55E" strokeWidth={2} fill="url(#gradProfit)" name="profit" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pie métodos de pago */}
            <SectionCard title="Métodos de pago">
              <div className="p-5">
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={paymentData} cx="50%" cy="50%"
                      innerRadius={55} outerRadius={85} paddingAngle={3}
                      dataKey="value" nameKey="name">
                      {paymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCOP(v as number)} contentStyle={tooltipStyle} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            {/* Top 5 products mini */}
            <SectionCard title="Top 5 productos">
              <div className="p-5 space-y-3">
                {topProducts.slice(0, 5).map((p, i) => (
                  <div key={p.name} className="flex items-center gap-3">
                    <span className="text-xs font-mono w-5 text-right shrink-0" style={{ color: '#A8A29E' }}>#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="truncate font-medium" style={{ color: '#1C1917' }}>{p.name}</span>
                        <span className="shrink-0 ml-2" style={{ color: '#8B5C2A' }}>{formatCOP(p.revenue)}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F0EDE8' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${topProducts[0] ? (p.revenue / topProducts[0].revenue) * 100 : 0}%`, background: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                    <span className="text-xs shrink-0 w-8 text-right" style={{ color: '#A8A29E' }}>{p.qty}u</span>
                  </div>
                ))}
                {topProducts.length === 0 && (
                  <p className="text-xs text-center py-6" style={{ color: '#A8A29E' }}>Sin ventas en el período</p>
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* Tab: VENTAS                                           */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'ventas' && (
        <div className="space-y-4">
          {/* Bar chart productos */}
          <SectionCard title="Ingresos por producto"
            action={<CsvButton onClick={() => downloadCSV(
              topProducts.map(p => ({ Producto: p.name, Unidades: p.qty, Ingresos: p.revenue, Costo: p.cost, Margen: `${p.margin.toFixed(1)}%` })),
              'productos-ventas.csv'
            )} />}>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={Math.max(topProducts.length * 36, 200)}>
                <BarChart data={topProducts} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#A8A29E' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#78716C' }} tickLine={false} axisLine={false} width={80} />
                  <Tooltip formatter={(v, name) => [formatCOP(v as number), (name as string) === 'revenue' ? 'Ingresos' : 'Costo']}
                    contentStyle={tooltipStyle} />
                  <Bar dataKey="revenue" name="revenue" radius={[0, 4, 4, 0]}>
                    {topProducts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Ventas table */}
          <SectionCard title={`Detalle de ventas — ${filteredOrders.length} pedidos`}
            action={<CsvButton onClick={() => downloadCSV(
              filteredOrders.map(o => ({
                Pedido: `#${o.order_number}`, Fecha: o.created_at.slice(0, 10),
                Cliente: o.customer?.full_name ?? 'Sin cliente',
                Vendedor: o.seller?.full_name ?? '',
                MetodoPago: PAYMENT_LABELS[o.payment_method] ?? o.payment_method,
                Subtotal: o.subtotal, Descuento: o.discount, Total: o.total,
              })), 'ventas-detalle.csv'
            )} />}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: '600px' }}>
                <thead>
                  <tr style={{ background: '#FAFAF9' }}>
                    {['#', 'Fecha', 'Cliente', 'Vendedor', 'Método', 'Descuento', 'Total'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: '#78716C' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.slice().reverse().slice(0, 100).map((o, idx) => (
                    <tr key={o.id} className="hover:bg-amber-50 transition-colors"
                      style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAF9' }}>
                      <td className="px-4 py-2.5 font-mono font-medium" style={{ color: '#8B5C2A' }}>#{o.order_number}</td>
                      <td className="px-4 py-2.5" style={{ color: '#78716C' }}>{o.created_at.slice(0, 10)}</td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: '#1C1917' }}>{o.customer?.full_name ?? '—'}</td>
                      <td className="px-4 py-2.5" style={{ color: '#78716C' }}>{o.seller?.full_name ?? '—'}</td>
                      <td className="px-4 py-2.5" style={{ color: '#78716C' }}>{PAYMENT_LABELS[o.payment_method] ?? o.payment_method}</td>
                      <td className="px-4 py-2.5" style={{ color: o.discount > 0 ? '#EF4444' : '#A8A29E' }}>
                        {o.discount > 0 ? `-${formatCOP(o.discount)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-semibold" style={{ color: '#1C1917' }}>{formatCOP(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredOrders.length === 0 && (
                <p className="py-16 text-center text-xs" style={{ color: '#A8A29E' }}>Sin ventas en el período seleccionado</p>
              )}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* Tab: CLIENTES                                         */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'clientes' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bar chart */}
            <SectionCard title="Top clientes por facturación">
              <div className="p-5">
                <ResponsiveContainer width="100%" height={Math.max(topClients.length * 36, 200)}>
                  <BarChart data={topClients} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" horizontal={false} />
                    <XAxis type="number" tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#A8A29E' }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#78716C' }} tickLine={false} axisLine={false} width={85} />
                    <Tooltip formatter={(v) => formatCOP(v as number)} contentStyle={tooltipStyle} />
                    <Bar dataKey="total" name="Facturado" radius={[0, 4, 4, 0]}>
                      {topClients.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            {/* Client list */}
            <SectionCard title="Detalle"
              action={<CsvButton onClick={() => downloadCSV(
                topClients.map(c => ({ Cliente: c.name, Pedidos: c.orders, Total: c.total, Promedio: Math.round(c.total / c.orders) })),
                'clientes.csv'
              )} />}>
              <div className="p-2">
                {topClients.map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between px-3 py-3 rounded-xl transition-colors hover:bg-amber-50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: COLORS[i % COLORS.length] + '22', color: COLORS[i % COLORS.length] }}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: '#1C1917' }}>{c.name}</p>
                        <p className="text-xs" style={{ color: '#A8A29E' }}>
                          {c.orders} pedido{c.orders !== 1 ? 's' : ''} · prom. {formatCOP(Math.round(c.total / c.orders))}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold" style={{ color: '#8B5C2A' }}>{formatCOP(c.total)}</span>
                  </div>
                ))}
                {topClients.length === 0 && (
                  <p className="text-xs text-center py-6" style={{ color: '#A8A29E' }}>Sin datos en el período</p>
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* Tab: COMPRAS & GASTOS                                 */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'compras' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Compras (inventario)', value: comprasTotals.compras, color: '#F97316' },
              { label: 'Gastos operativos',    value: comprasTotals.gastos,  color: '#3B82F6' },
              { label: 'Total egresos',        value: comprasTotals.compras + comprasTotals.gastos, color: '#EF4444' },
            ].map(c => (
              <div key={c.label} className="rounded-2xl border p-5" style={{ background: '#fff', borderColor: '#E7E5E4' }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                  <p className="text-xs" style={{ color: '#78716C' }}>{c.label}</p>
                </div>
                <p className="text-xl font-bold" style={{ color: '#1C1917' }}>{formatCOP(c.value)}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pie */}
            <SectionCard title="Distribución">
              <div className="p-5">
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={comprasPieData} cx="50%" cy="50%"
                      innerRadius={55} outerRadius={85} paddingAngle={3}
                      dataKey="value" nameKey="name">
                      {comprasPieData.map((_, i) => <Cell key={i} fill={['#F97316', '#3B82F6'][i]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCOP(v as number)} contentStyle={tooltipStyle} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            {/* Table */}
            <SectionCard title={`Detalle — ${filteredCompras.length} registros`}
              action={<CsvButton onClick={() => downloadCSV(
                filteredCompras.map(c => ({ Fecha: c.fecha, Tipo: c.tipo, Concepto: c.concepto, Proveedor: c.proveedor ?? '', Monto: c.monto })),
                'compras.csv'
              )} />}>
              <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '260px' }}>
                <table className="w-full text-xs" style={{ minWidth: '400px' }}>
                  <thead className="sticky top-0" style={{ background: '#FAFAF9' }}>
                    <tr>
                      {['Fecha', 'Tipo', 'Concepto', 'Monto'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-medium" style={{ color: '#78716C' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompras.map((c, idx) => (
                      <tr key={c.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAF9' }}>
                        <td className="px-4 py-2" style={{ color: '#78716C' }}>{c.fecha.slice(0, 10)}</td>
                        <td className="px-4 py-2">
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium"
                            style={{ background: c.tipo === 'compra' ? '#FEF3C7' : '#DBEAFE', color: c.tipo === 'compra' ? '#92400E' : '#1E40AF' }}>
                            {c.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-medium" style={{ color: '#1C1917' }}>{c.concepto}</td>
                        <td className="px-4 py-2 font-semibold" style={{ color: '#EF4444' }}>-{formatCOP(c.monto)}</td>
                      </tr>
                    ))}
                    {filteredCompras.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: '#A8A29E' }}>Sin registros en el período</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* Tab: RENTABILIDAD                                     */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'rentabilidad' && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-4 text-xs" style={{ background: '#FFFBEB', borderColor: '#FDE68A', color: '#92400E' }}>
            Análisis sobre el catálogo de productos activos. El margen se calcula con los precios actuales — no está filtrado por período.
          </div>

          {/* Grouped bar margin */}
          <SectionCard title="Margen bruto por producto — Precio 1 vs Precio 2">
            <div className="p-5">
              <ResponsiveContainer width="100%" height={Math.max(rentabilidadData.length * 44, 200)}>
                <BarChart data={rentabilidadData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 11, fill: '#A8A29E' }} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#78716C' }} tickLine={false} axisLine={false} width={80} />
                  <Tooltip
                    formatter={(v, name) => [`${(v as number).toFixed(1)}%`, (name as string) === 'margenP1' ? 'Margen P1 (Distribuidor)' : 'Margen P2 (Público)']}
                    contentStyle={tooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }}
                    formatter={v => v === 'margenP1' ? 'Precio 1 — Distribuidor' : 'Precio 2 — Público'} />
                  <Bar dataKey="margenP1" name="margenP1" fill="#8B5C2A" radius={[0, 2, 2, 0]} barSize={8} />
                  <Bar dataKey="margenP2" name="margenP2" fill="#22C55E"  radius={[0, 2, 2, 0]} barSize={8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Rentabilidad table */}
          <SectionCard title="Tabla de rentabilidad completa"
            action={<CsvButton onClick={() => downloadCSV(
              rentabilidadData.map(p => ({
                Producto: p.name, Costo: p.costo, Precio1: p.precio1, Precio2: p.precio2,
                MargenP1: `${p.margenP1.toFixed(1)}%`, GananciaP1: p.gananciaP1,
                MargenP2: `${p.margenP2.toFixed(1)}%`, GananciaP2: p.gananciaP2,
                Stock: p.stock,
              })), 'rentabilidad.csv'
            )} />}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: '700px' }}>
                <thead>
                  <tr style={{ background: '#FAFAF9' }}>
                    {['Producto', 'Costo', 'Precio 1', 'Ganancia P1', 'Margen P1', 'Precio 2', 'Ganancia P2', 'Margen P2', 'Stock'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap" style={{ color: '#78716C' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rentabilidadData.map((p, idx) => (
                    <tr key={p.name} className="hover:bg-amber-50 transition-colors"
                      style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAF9' }}>
                      <td className="px-4 py-3 font-medium" style={{ color: '#1C1917' }}>{p.name}</td>
                      <td className="px-4 py-3"              style={{ color: '#78716C' }}>{formatCOP(p.costo)}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: '#1C1917' }}>{formatCOP(p.precio1)}</td>
                      <td className="px-4 py-3"              style={{ color: '#22C55E' }}>{formatCOP(p.gananciaP1)}</td>
                      <td className="px-4 py-3"><MarginBadge value={p.margenP1} /></td>
                      <td className="px-4 py-3 font-medium" style={{ color: '#1C1917' }}>{formatCOP(p.precio2)}</td>
                      <td className="px-4 py-3"              style={{ color: '#22C55E' }}>{formatCOP(p.gananciaP2)}</td>
                      <td className="px-4 py-3"><MarginBadge value={p.margenP2} /></td>
                      <td className="px-4 py-3"              style={{ color: '#78716C' }}>{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}

    </div>
  )
}
