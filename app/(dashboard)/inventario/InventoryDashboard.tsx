'use client'

import { useMemo } from 'react'
import { Product } from '@/lib/types'
import { formatCOP } from '@/lib/utils'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Warehouse, DollarSign, TrendingUp, AlertTriangle, XCircle, ShoppingBag } from 'lucide-react'

interface InventoryDashboardProps {
  products: Product[]
  onSelectFilter: (filter: 'all' | 'low' | 'out' | 'normal') => void
  onOpenRestockModal: () => void
}

const HEALTH_COLORS = {
  normal: '#16a34a',
  low: '#d97706',
  out: '#dc2626',
}

export function InventoryDashboard({
  products,
  onSelectFilter,
  onOpenRestockModal,
}: InventoryDashboardProps) {
  // Calculos KPI de valorización
  const stats = useMemo(() => {
    let totalCostValuation = 0
    let totalSaleValuation = 0
    let totalUnits = 0
    let lowStockCount = 0
    let outOfStockCount = 0
    let normalCount = 0

    products.forEach((p) => {
      const stock = p.stock || 0
      const cost = Number(p.cost_price || 0)
      const price = Number(p.precio1 || 0)
      const minStock = p.min_stock || 0

      totalCostValuation += stock * cost
      totalSaleValuation += stock * price
      totalUnits += stock

      if (stock === 0) {
        outOfStockCount++
      } else if (stock <= minStock) {
        lowStockCount++
      } else {
        normalCount++
      }
    })

    const potentialMargin = totalSaleValuation - totalCostValuation
    const marginPct = totalSaleValuation > 0 ? (potentialMargin / totalSaleValuation) * 100 : 0

    return {
      totalCostValuation,
      totalSaleValuation,
      potentialMargin,
      marginPct,
      totalUnits,
      lowStockCount,
      outOfStockCount,
      normalCount,
      totalProducts: products.length,
    }
  }, [products])

  // Datos para gráfico por tipo/categoría
  const typeValuationData = useMemo(() => {
    const map: Record<string, { name: string; costo: number; venta: number }> = {}

    products.forEach((p) => {
      const typeName = p.tipo?.nombre || 'Sin Tipo'
      const stock = p.stock || 0
      const cost = Number(p.cost_price || 0)
      const price = Number(p.precio1 || 0)

      if (!map[typeName]) {
        map[typeName] = { name: typeName, costo: 0, venta: 0 }
      }
      map[typeName].costo += stock * cost
      map[typeName].venta += stock * price
    })

    return Object.values(map)
      .sort((a, b) => b.costo - a.costo)
      .slice(0, 8)
  }, [products])

  // Datos para Top 5 productos de mayor inversión/valor a costo
  const topValuedProducts = useMemo(() => {
    return [...products]
      .map((p) => ({
        name: p.name.length > 18 ? p.name.substring(0, 16) + '...' : p.name,
        fullName: p.name,
        valorCosto: (p.stock || 0) * Number(p.cost_price || 0),
        valorVenta: (p.stock || 0) * Number(p.precio1 || 0),
        stock: p.stock || 0,
      }))
      .filter((p) => p.valorCosto > 0)
      .sort((a, b) => b.valorCosto - a.valorCosto)
      .slice(0, 5)
  }, [products])

  // Datos para gráfico de salud de stock
  const healthData = useMemo(() => {
    return [
      { name: 'Stock Normal', value: stats.normalCount, color: HEALTH_COLORS.normal },
      { name: 'Stock Bajo', value: stats.lowStockCount, color: HEALTH_COLORS.low },
      { name: 'Agotado', value: stats.outOfStockCount, color: HEALTH_COLORS.out },
    ].filter((d) => d.value > 0)
  }, [stats])

  return (
    <div className="space-y-6">
      {/* Banner de alerta inteligente si hay ítems críticos */}
      {(stats.outOfStockCount > 0 || stats.lowStockCount > 0) && (
        <div
          className="p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          style={{
            background: stats.outOfStockCount > 0 ? '#fef2f2' : '#fffbe6',
            borderColor: stats.outOfStockCount > 0 ? '#fca5a5' : '#fde68a',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: stats.outOfStockCount > 0 ? '#fee2e2' : '#fef3c7',
                color: stats.outOfStockCount > 0 ? '#dc2626' : '#d97706',
              }}
            >
              {stats.outOfStockCount > 0 ? <XCircle size={22} /> : <AlertTriangle size={22} />}
            </div>
            <div>
              <h4
                className="font-semibold text-sm"
                style={{ color: stats.outOfStockCount > 0 ? '#991b1b' : '#92400e' }}
              >
                Atención a Niveles de Inventario
              </h4>
              <p
                className="text-xs mt-0.5"
                style={{ color: stats.outOfStockCount > 0 ? '#b91c1c' : '#b45309' }}
              >
                Hay{' '}
                {stats.outOfStockCount > 0 && (
                  <strong className="font-semibold">{stats.outOfStockCount} productos AGOTADOS</strong>
                )}
                {stats.outOfStockCount > 0 && stats.lowStockCount > 0 && ' y '}
                {stats.lowStockCount > 0 && (
                  <strong className="font-semibold">{stats.lowStockCount} con stock bajo</strong>
                )}
                . Requieren reabastecimiento pronto.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {stats.outOfStockCount > 0 ? (
              <button
                onClick={() => onSelectFilter('out')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-white shadow-xs hover:bg-slate-50 transition-colors"
                style={{ borderColor: '#fca5a5', color: '#dc2626' }}
              >
                Ver Agotados
              </button>
            ) : (
              <button
                onClick={() => onSelectFilter('low')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-white shadow-xs hover:bg-slate-50 transition-colors"
                style={{ borderColor: '#fde68a', color: '#d97706' }}
              >
                Ver Stock Bajo
              </button>
            )}
            <button
              onClick={onOpenRestockModal}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white flex items-center gap-1.5 shadow-xs transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)' }}
            >
              <ShoppingBag size={14} /> Sugerido de Compras
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Valor a Costo */}
        <div
          className="p-5 rounded-xl border shadow-xs transition-shadow hover:shadow-md"
          style={{ background: '#fff', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Valorización (Costo)
            </span>
            <div
              className="p-2 rounded-lg"
              style={{ background: 'var(--secondary)', color: 'var(--primary)' }}
            >
              <DollarSign size={18} />
            </div>
          </div>
          <div className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--foreground)' }}>
            {formatCOP(stats.totalCostValuation)}
          </div>
          <p className="text-xs mt-1 text-muted-foreground">
            Inversión inmovilizada en stock
          </p>
        </div>

        {/* Card 2: Valor a Venta */}
        <div
          className="p-5 rounded-xl border shadow-xs transition-shadow hover:shadow-md"
          style={{ background: '#fff', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Valorización (Venta)
            </span>
            <div
              className="p-2 rounded-lg"
              style={{ background: '#dcfce7', color: '#16a34a' }}
            >
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--foreground)' }}>
            {formatCOP(stats.totalSaleValuation)}
          </div>
          <p className="text-xs mt-1 text-muted-foreground">
            Retorno potencial estimado
          </p>
        </div>

        {/* Card 3: Utilidad Inmovilizada */}
        <div
          className="p-5 rounded-xl border shadow-xs transition-shadow hover:shadow-md"
          style={{ background: '#fff', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Margen Potencial Total
            </span>
            <div
              className="p-2 rounded-lg"
              style={{ background: '#eff6ff', color: '#3b82f6' }}
            >
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="text-2xl font-extrabold tracking-tight" style={{ color: '#16a34a' }}>
            {formatCOP(stats.potentialMargin)}
          </div>
          <div className="flex items-center justify-between text-xs mt-1 text-muted-foreground">
            <span>Ganancia Bruta Almacén</span>
            <span className="font-semibold px-1.5 py-0.5 rounded bg-green-50 text-green-700">
              {stats.marginPct.toFixed(1)}% margen
            </span>
          </div>
        </div>

        {/* Card 4: Unidades & Referencias */}
        <div
          className="p-5 rounded-xl border shadow-xs transition-shadow hover:shadow-md"
          style={{ background: '#fff', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Volumen en Bodega
            </span>
            <div
              className="p-2 rounded-lg"
              style={{ background: '#fef3c7', color: '#d97706' }}
            >
              <Warehouse size={18} />
            </div>
          </div>
          <div className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--foreground)' }}>
            {stats.totalUnits.toLocaleString('es-CO')}{' '}
            <span className="text-sm font-normal text-muted-foreground">unids</span>
          </div>
          <div className="flex items-center gap-3 text-xs mt-1 text-muted-foreground">
            <span>{stats.totalProducts} referencias SKU</span>
          </div>
        </div>
      </div>

      {/* Gráficos Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico 1: Valor por Tipo / Categoría (2 columnas en LG) */}
        <div
          className="lg:col-span-2 p-5 rounded-xl border"
          style={{ background: '#fff', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>
                Valorización por Tipo de Producto
              </h3>
              <p className="text-xs text-muted-foreground">
                Comparativa de inversión a Costo vs Potencial a Venta
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            {typeValuationData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Sin datos de inventario
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeValuationData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0e8dc" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: '#78716c' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e7ddd0' }}
                  />
                  <YAxis
                    tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`}
                    tick={{ fontSize: 11, fill: '#78716c' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value: any) => [formatCOP(Number(value)), '']}
                    contentStyle={{
                      background: '#fff',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--border)',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }}
                  />
                  <Bar dataKey="costo" name="Valor Costo" fill="#7c5c42" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="venta" name="Valor Venta" fill="#c4832a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Gráfico 2: Donut Chart de Salud del Inventario (1 columna en LG) */}
        <div
          className="p-5 rounded-xl border flex flex-col justify-between"
          style={{ background: '#fff', borderColor: 'var(--border)' }}
        >
          <div>
            <h3 className="font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
              Salud del Inventario
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Estado de stock según niveles mínimos
            </p>
          </div>

          <div className="h-56 w-full relative flex items-center justify-center">
            {healthData.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sin productos</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={healthData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {healthData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [`${val} productos`, 'CANTIDAD']}
                    contentStyle={{
                      background: '#fff',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--border)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}

            {/* Texto central */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold">{stats.totalProducts}</span>
              <span className="text-xs text-muted-foreground">SKUs</span>
            </div>
          </div>

          {/* Leyenda interactiva de Salud */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => onSelectFilter('normal')}
              className="p-2 rounded-lg text-center hover:bg-slate-50 transition-colors"
            >
              <div className="text-xs font-semibold text-green-700">{stats.normalCount}</div>
              <div className="text-[11px] text-muted-foreground">Normales</div>
            </button>
            <button
              onClick={() => onSelectFilter('low')}
              className="p-2 rounded-lg text-center hover:bg-slate-50 transition-colors"
            >
              <div className="text-xs font-semibold text-amber-600">{stats.lowStockCount}</div>
              <div className="text-[11px] text-muted-foreground">Bajos</div>
            </button>
            <button
              onClick={() => onSelectFilter('out')}
              className="p-2 rounded-lg text-center hover:bg-slate-50 transition-colors"
            >
              <div className="text-xs font-semibold text-red-600">{stats.outOfStockCount}</div>
              <div className="text-[11px] text-muted-foreground">Agotados</div>
            </button>
          </div>
        </div>
      </div>

      {/* Top 5 productos de mayor inversión inmovilizada */}
      <div
        className="p-5 rounded-xl border"
        style={{ background: '#fff', borderColor: 'var(--border)' }}
      >
        <div className="mb-4">
          <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>
            Top 5 Productos con Mayor Inversión en Bodega
          </h3>
          <p className="text-xs text-muted-foreground">
            Productos donde se concentra la mayor valorización a costo del inventario actual
          </p>
        </div>

        <div className="space-y-3">
          {topValuedProducts.map((p, idx) => {
            const maxVal = topValuedProducts[0]?.valorCosto || 1
            const pct = (p.valorCosto / maxVal) * 100

            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800 flex items-center gap-2">
                    <span
                      className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] flex items-center justify-center shrink-0"
                    >
                      {idx + 1}
                    </span>
                    {p.fullName}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">{p.stock} unids en stock</span>
                    <span className="font-bold text-slate-900">{formatCOP(p.valorCosto)}</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: 'linear-gradient(90deg, #7c5c42 0%, #c4832a 100%)',
                    }}
                  />
                </div>
              </div>
            )
          })}

          {topValuedProducts.length === 0 && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No hay productos con stock valorizado en este momento.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
