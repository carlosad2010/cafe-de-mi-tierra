'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP, formatDateTime, ORDER_STATUS } from '@/lib/utils'
import {
  TrendingUp, ShoppingCart, Users, AlertTriangle,
  DollarSign, Package
} from 'lucide-react'

type Stats = {
  today_revenue: number
  today_orders: number
  month_revenue: number
  month_orders: number
  low_stock_count: number
  total_customers: number
}

export function DashboardClient({
  stats: initialStats,
  lowStockProducts,
  recentOrders: initialOrders,
}: {
  stats: Stats
  lowStockProducts: any[]
  recentOrders: any[]
}) {
  const [stats, setStats] = useState(initialStats)
  const [recentOrders, setRecentOrders] = useState(initialOrders)

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
      }, async () => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

        const [{ data: todayOrders }, { data: monthOrders }, { data: recent }] = await Promise.all([
          supabase.from('orders').select('total').eq('status', 'completado').gte('created_at', today.toISOString()),
          supabase.from('orders').select('total').eq('status', 'completado').gte('created_at', monthStart.toISOString()),
          supabase.from('orders').select('*, customer:customers(full_name), seller:profiles(full_name)').order('created_at', { ascending: false }).limit(8),
        ])

        setStats(prev => ({
          ...prev,
          today_revenue: (todayOrders ?? []).reduce((s, o) => s + Number(o.total), 0),
          today_orders: (todayOrders ?? []).length,
          month_revenue: (monthOrders ?? []).reduce((s, o) => s + Number(o.total), 0),
          month_orders: (monthOrders ?? []).length,
        }))
        setRecentOrders(recent ?? [])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const cards = [
    { label: 'Ventas hoy', value: formatCOP(stats.today_revenue), sub: `${stats.today_orders} pedidos`, icon: DollarSign, color: '#8b5e3c' },
    { label: 'Ventas del mes', value: formatCOP(stats.month_revenue), sub: `${stats.month_orders} pedidos`, icon: TrendingUp, color: '#c4832a' },
    { label: 'Clientes', value: stats.total_customers.toString(), sub: 'Total registrados', icon: Users, color: '#6b4423' },
    { label: 'Stock bajo', value: stats.low_stock_count.toString(), sub: 'Productos por reponer', icon: AlertTriangle, color: stats.low_stock_count > 0 ? '#dc2626' : '#16a34a' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Dashboard</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Resumen en tiempo real</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="rounded-xl border p-5" style={{ background: '#fff', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{card.label}</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: 'var(--foreground)' }}>{card.value}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{card.sub}</p>
                </div>
                <div className="rounded-lg p-2.5" style={{ background: 'var(--secondary)' }}>
                  <Icon size={20} style={{ color: card.color }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent orders */}
        <div className="lg:col-span-2 rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)' }}>
          <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Pedidos recientes</h2>
            <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}>
              Tiempo real
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {recentOrders.length === 0 && (
              <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
                Sin pedidos aún
              </p>
            )}
            {recentOrders.map((order: any) => {
              const st = ORDER_STATUS[order.status]
              return (
                <div key={order.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                      #{order.order_number} — {order.customer?.full_name ?? 'Sin cliente'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      {formatDateTime(order.created_at)} · {order.seller?.full_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${st?.color}`}>
                      {st?.label}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>
                      {formatCOP(order.total)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Low stock */}
        <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)' }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Stock bajo</h2>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {lowStockProducts.length === 0 && (
              <p className="px-5 py-8 text-center text-sm" style={{ color: '#16a34a' }}>
                Inventario en buen estado
              </p>
            )}
            {lowStockProducts.map((p: any) => (
              <div key={p.id} className="px-5 py-3">
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                  {p.presentation} {p.type}
                </p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    Stock: {p.stock} / Mín: {p.min_stock}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#dc2626' }}>
                    Reponer
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
