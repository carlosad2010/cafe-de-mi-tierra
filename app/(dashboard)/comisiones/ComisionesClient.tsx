'use client'

import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatCOP } from '@/lib/utils'
import { GenerarInformeModal } from './GenerarInformeModal'
import { Download, FileSpreadsheet, AlertTriangle } from 'lucide-react'

type Order = {
  id: string
  order_number: number
  created_at: string
  total: number
  seller?: { id: string; full_name: string } | null
  items: { product_presentation: string; quantity: number; comision_unitaria: number | null }[]
}

const COLORS = ['#8B5C2A', '#3B82F6', '#22C55E', '#EF4444', '#A855F7', '#F97316', '#14B8A6', '#EC4899']

function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return
  const headers = Object.keys(data[0])
  const rows = data.map(row =>
    headers.map(h => {
      const v = row[h]
      if (typeof v !== 'string') return String(v ?? '')
      const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
      return `"${safe.replace(/"/g, '""')}"`
    }).join(',')
  )
  const csv = '﻿' + [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

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

export function ComisionesClient({
  orders,
  presentacionesSinTarifa,
}: {
  orders: Order[]
  presentacionesSinTarifa: string[]
}) {
  const [period, setPeriod] = useState<'30d' | '90d' | '365d' | 'all' | 'custom'>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showInforme, setShowInforme] = useState(false)

  const { start, end } = useMemo(() => {
    const now = new Date()
    if (period === 'custom') {
      const startDate = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(0)
      const endDate = customTo ? new Date(`${customTo}T23:59:59.999`) : now
      return { start: startDate, end: endDate }
    }
    if (period === 'all') return { start: new Date(0), end: now }
    const days: Record<string, number> = { '30d': 30, '90d': 90, '365d': 365 }
    const start = new Date()
    start.setDate(start.getDate() - days[period])
    start.setHours(0, 0, 0, 0)
    return { start, end: now }
  }, [period, customFrom, customTo])

  const filteredOrders = useMemo(
    () => orders.filter(o => { const d = new Date(o.created_at); return d >= start && d <= end }),
    [orders, start, end]
  )

  // Aggregation: seller -> presentation -> units, comissions
  const comisionesData = useMemo(() => {
    const map = new Map<string, {
      sellerId: string
      sellerName: string
      presentations: Record<string, { units: number; commission: number; unitaria: number }>
      totalCommission: number
      totalUnits: number
    }>()

    filteredOrders.forEach(order => {
      if (!order.seller) return
      const key = order.seller.full_name
      let seller = map.get(key)
      if (!seller) {
        seller = {
          sellerId: order.seller.id,
          sellerName: key,
          presentations: {},
          totalCommission: 0,
          totalUnits: 0,
        }
        map.set(key, seller)
      }

      order.items.forEach(item => {
        // Sin tarifa congelada la línea no aporta comisión; se reporta aparte
        // en vez de estimarle un valor.
        const unitaria = item.comision_unitaria
        if (unitaria == null) return
        const pres = item.product_presentation

        const commission = unitaria * item.quantity
        if (!seller.presentations[pres]) {
          seller.presentations[pres] = { units: 0, commission: 0, unitaria }
        }
        seller.presentations[pres].units += item.quantity
        seller.presentations[pres].commission += commission
        seller.totalCommission += commission
        seller.totalUnits += item.quantity
      })
    })

    return Array.from(map.values()).sort((a, b) => b.totalCommission - a.totalCommission)
  }, [filteredOrders])

  const kpis = useMemo(() => {
    const totalCommission = comisionesData.reduce((s, s_) => s + s_.totalCommission, 0)
    const totalUnits = comisionesData.reduce((s, s_) => s + s_.totalUnits, 0)
    const avgPerSeller = comisionesData.length > 0 ? totalCommission / comisionesData.length : 0
    return { totalCommission, totalUnits, sellers: comisionesData.length, avgPerSeller }
  }, [comisionesData])

  const chartData = useMemo(() => comisionesData.map(s => ({
    name: s.sellerName,
    commission: s.totalCommission,
    units: s.totalUnits,
  })), [comisionesData])

  return (
    <div className="p-6 space-y-6" style={{ background: '#F5F0EB', minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#1C1917' }}>Comisiones de Ventas</h1>
            <p className="text-sm mt-0.5" style={{ color: '#78716C' }}>
              {comisionesData.length} vendedores · {filteredOrders.length} órdenes
            </p>
          </div>
          <button onClick={() => setShowInforme(true)} className="btn btn-primary btn-sm">
            <FileSpreadsheet size={14} /> Generar informe
          </button>
        </div>
        {/* Period selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#E7E4DF' }}>
            {(['30d', '90d', '365d', 'all', 'custom'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
                style={period === p
                  ? { background: '#1C1917', color: '#FFF8F0' }
                  : { color: '#78716C' }}>
                {p === '30d' ? '30 días' : p === '90d' ? '3 meses' : p === '365d' ? '1 año' : p === 'all' ? 'Todo' : 'Personalizado'}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={customFrom} max={customTo || undefined}
                onChange={e => setCustomFrom(e.target.value)}
                className="input-field" style={{ width: 'auto', padding: '0.375rem 0.5rem', fontSize: '0.75rem' }} />
              <span className="text-xs" style={{ color: '#A8A29E' }}>a</span>
              <input type="date" value={customTo} min={customFrom || undefined}
                onChange={e => setCustomTo(e.target.value)}
                className="input-field" style={{ width: 'auto', padding: '0.375rem 0.5rem', fontSize: '0.75rem' }} />
            </div>
          )}
        </div>
      </div>

      {presentacionesSinTarifa.length > 0 && (
        <div className="rounded-2xl border p-4 flex items-start gap-3"
          style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
          <AlertTriangle size={16} style={{ color: '#92400E', flexShrink: 0, marginTop: 2 }} />
          <div className="text-xs" style={{ color: '#92400E' }}>
            <p className="font-semibold mb-0.5">
              {presentacionesSinTarifa.length === 1 ? 'Una presentación activa no tiene comisión definida' : 'Hay presentaciones activas sin comisión definida'}
              : {presentacionesSinTarifa.join(', ')}
            </p>
            <p>
              Sus ventas liquidan en $0 y no aparecen en los totales de abajo. Define la tarifa
              en Configuración › Presentaciones; las ventas ya registradas conservan la comisión
              con la que se guardaron.
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total comisiones" value={formatCOP(kpis.totalCommission)} sub={`${kpis.totalUnits} unidades vendidas`} accent="#8B5C2A" />
        <KpiCard label="Vendedores" value={String(kpis.sellers)} sub="Con comisiones registradas" accent="#3B82F6" />
        <KpiCard label="Comisión promedio" value={formatCOP(kpis.avgPerSeller)} sub="Por vendedor" accent="#22C55E" />
        <KpiCard label="Unidades promedio" value={String(Math.round(kpis.totalUnits / Math.max(kpis.sellers, 1)))} sub="Por vendedor" accent="#F97316" />
      </div>

      {/* Chart */}
      <SectionCard title="Comisiones por vendedor"
        action={<button onClick={() => downloadCSV(
          comisionesData.map(s => ({
            Vendedor: s.sellerName,
            Unidades: s.totalUnits,
            'Comisión Total': s.totalCommission,
          })),
          'comisiones.csv'
        )} className="btn btn-secondary btn-sm">
          <Download size={13} /> CSV
        </button>}>
        <div className="p-5">
          <ResponsiveContainer width="100%" height={Math.max(comisionesData.length * 40, 250)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 120, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#A8A29E' }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#78716C' }} tickLine={false} axisLine={false} width={110} />
              <Tooltip formatter={(v) => formatCOP(v as number)} contentStyle={tooltipStyle} />
              <Bar dataKey="commission" name="Comisión" radius={[0, 4, 4, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* Detailed table */}
      <SectionCard title="Detalle por vendedor y presentación"
        action={<button onClick={() => downloadCSV(
          comisionesData.flatMap(s =>
            Object.entries(s.presentations).map(([gram, data]) => ({
              Vendedor: s.sellerName,
              Presentación: gram,
              Unidades: data.units,
              'Comisión Total': data.commission,
              'Comisión Unitaria': data.unitaria,
            }))
          ),
          'comisiones-detalle.csv'
        )} className="btn btn-secondary btn-sm">
          <Download size={13} /> CSV Detalle
        </button>}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: '700px' }}>
            <thead>
              <tr style={{ background: '#FAFAF9' }}>
                {['Vendedor', 'Presentación', 'Unidades', 'Comisión Unitaria', 'Comisión Total'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: '#78716C' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comisionesData.flatMap((s, si) =>
                Object.entries(s.presentations).map(([gram, data], pi) => (
                  <tr key={`${si}-${gram}`} style={{ background: (si + pi) % 2 === 0 ? '#fff' : '#FAFAF9' }}>
                    {pi === 0 && (
                      <td rowSpan={Object.keys(s.presentations).length} className="px-4 py-2 font-semibold" style={{ color: '#1C1917' }}>
                        {s.sellerName}
                      </td>
                    )}
                    <td className="px-4 py-2" style={{ color: '#78716C' }}>{gram}</td>
                    <td className="px-4 py-2 font-medium" style={{ color: '#1C1917' }}>{data.units}</td>
                    <td className="px-4 py-2" style={{ color: '#8B5C2A' }}>{formatCOP(data.unitaria)}</td>
                    <td className="px-4 py-2 font-semibold" style={{ color: '#22C55E' }}>{formatCOP(data.commission)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Summary by seller */}
      <SectionCard title="Resumen totales por vendedor">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: '#FAFAF9' }}>
                {['Vendedor', 'Unidades', 'Comisión Total'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: '#78716C' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comisionesData.map((s, i) => (
                <tr key={s.sellerId} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAF9' }}>
                  <td className="px-4 py-2.5 font-semibold" style={{ color: '#1C1917' }}>{s.sellerName}</td>
                  <td className="px-4 py-2.5" style={{ color: '#78716C' }}>{s.totalUnits}</td>
                  <td className="px-4 py-2.5 font-bold" style={{ color: '#8B5C2A' }}>{formatCOP(s.totalCommission)}</td>
                </tr>
              ))}
              <tr style={{ background: '#E7E5E4', fontWeight: 'bold' }}>
                <td className="px-4 py-3" style={{ color: '#1C1917' }}>TOTAL</td>
                <td className="px-4 py-3" style={{ color: '#1C1917' }}>{kpis.totalUnits}</td>
                <td className="px-4 py-3" style={{ color: '#8B5C2A' }}>{formatCOP(kpis.totalCommission)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      {showInforme && <GenerarInformeModal onClose={() => setShowInforme(false)} />}
    </div>
  )
}
