'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCOP, formatDateTime, ORDER_STATUS } from '@/lib/utils'
import {
  TrendingUp, ShoppingCart, Users, AlertTriangle,
  DollarSign, Package, ArrowUpRight, ChevronRight,
} from 'lucide-react'

type Stats = {
  today_revenue: number; today_orders: number
  month_revenue: number; month_orders: number
  low_stock_count: number; total_customers: number
}

// ─── Helpers ──────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

function getInitials(name?: string) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function StockBar({ stock, min }: { stock: number; min: number }) {
  const pct   = min > 0 ? Math.min((stock / (min * 2.5)) * 100, 100) : 100
  const color = pct < 30 ? '#EF4444' : pct < 60 ? '#F59E0B' : '#10B981'
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#FECACA22' }}>
      <div className="h-full rounded-full"
        style={{ width: `${pct}%`, background: color, transition: 'width 0.8s ease-out' }} />
    </div>
  )
}

const AVATAR_COLORS = ['#8B5C2A', '#3B82F6', '#10B981', '#A855F7', '#F97316', '#EC4899', '#14B8A6']

// ─── Main ─────────────────────────────────────────────────────
export function DashboardClient({
  stats: initialStats, lowStockProducts, recentOrders: initialOrders,
}: {
  stats: Stats
  lowStockProducts: any[]
  recentOrders: any[]
}) {
  const [stats, setStats]               = useState(initialStats)
  const [recentOrders, setRecentOrders] = useState(initialOrders)
  const [realtimePing, setRealtimePing] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const channel  = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
        const today      = new Date(); today.setHours(0, 0, 0, 0)
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        const [{ data: t }, { data: m }, { data: r }] = await Promise.all([
          supabase.from('orders').select('total').eq('status', 'completado').gte('created_at', today.toISOString()),
          supabase.from('orders').select('total').eq('status', 'completado').gte('created_at', monthStart.toISOString()),
          supabase.from('orders').select('*, customer:customers(full_name), seller:profiles(full_name)').order('created_at', { ascending: false }).limit(8),
        ])
        setStats(prev => ({
          ...prev,
          today_revenue: (t ?? []).reduce((s, o) => s + Number(o.total), 0),
          today_orders:  (t ?? []).length,
          month_revenue: (m ?? []).reduce((s, o) => s + Number(o.total), 0),
          month_orders:  (m ?? []).length,
        }))
        setRecentOrders(r ?? [])
        setRealtimePing(true)
        setTimeout(() => setRealtimePing(false), 800)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const cards = [
    {
      label: 'Ventas hoy',
      value: formatCOP(stats.today_revenue),
      sub: `${stats.today_orders} pedido${stats.today_orders !== 1 ? 's' : ''}`,
      icon: DollarSign,
      gradient: 'linear-gradient(135deg, #6B3A1F 0%, #C4832A 100%)',
      glow: 'rgba(196,131,42,0.30)',
    },
    {
      label: 'Este mes',
      value: formatCOP(stats.month_revenue),
      sub: `${stats.month_orders} pedidos`,
      icon: TrendingUp,
      gradient: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)',
      glow: 'rgba(59,130,246,0.28)',
    },
    {
      label: 'Clientes',
      value: stats.total_customers.toString(),
      sub: 'Total registrados',
      icon: Users,
      gradient: 'linear-gradient(135deg, #064E3B 0%, #10B981 100%)',
      glow: 'rgba(16,185,129,0.28)',
    },
    {
      label: 'Stock bajo',
      value: stats.low_stock_count.toString(),
      sub: stats.low_stock_count > 0 ? 'Productos por reponer' : 'Todo en orden',
      icon: stats.low_stock_count > 0 ? AlertTriangle : Package,
      gradient: stats.low_stock_count > 0
        ? 'linear-gradient(135deg, #7F1D1D 0%, #EF4444 100%)'
        : 'linear-gradient(135deg, #064E3B 0%, #10B981 100%)',
      glow: stats.low_stock_count > 0 ? 'rgba(239,68,68,0.28)' : 'rgba(16,185,129,0.28)',
    },
  ]

  const todayStr = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="p-4 sm:p-6 space-y-5 min-h-screen" style={{ background: '#F5F0EB' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: '#1C1917' }}>
            {getGreeting()}
          </h1>
          <p className="text-sm mt-0.5 capitalize" style={{ color: '#78716C' }}>{todayStr}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Realtime badge */}
          <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium select-none"
            style={{ background: '#DCFCE7', color: '#166534' }}>
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{
                background: '#22C55E',
                transition: 'transform 0.3s, opacity 0.3s',
                transform: realtimePing ? 'scale(1.6)' : 'scale(1)',
                opacity:   realtimePing ? 0.5 : 1,
              }} />
            En vivo
          </div>
          {/* CTA Informes */}
          <Link href="/informes"
            className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl font-semibold
                       transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
            style={{ background: '#1C1917', color: '#FFF8F0', boxShadow: '0 2px 8px rgba(28,25,23,0.25)' }}>
            Informes <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {cards.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label}
              className="relative rounded-2xl p-4 sm:p-5 overflow-hidden
                         transition-all duration-300 cursor-default
                         hover:-translate-y-1 hover:shadow-xl active:scale-[0.98]"
              style={{ background: card.gradient, boxShadow: `0 4px 20px ${card.glow}` }}>
              {/* Decorative blobs */}
              <span className="absolute -right-3 -top-3 w-20 h-20 rounded-full pointer-events-none"
                style={{ background: 'rgba(255,255,255,0.09)' }} />
              <span className="absolute right-2 -bottom-5 w-12 h-12 rounded-full pointer-events-none"
                style={{ background: 'rgba(255,255,255,0.06)' }} />

              <div className="relative z-10">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'rgba(255,255,255,0.20)' }}>
                  <Icon size={18} color="#fff" />
                </div>
                <p className="text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.72)' }}>
                  {card.label}
                </p>
                <p className="text-xl sm:text-2xl font-bold leading-tight break-all"
                  style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                  {card.value}
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.58)' }}>
                  {card.sub}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Main grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Pedidos recientes ────────────────────────────── */}
        <div className="lg:col-span-2 rounded-2xl overflow-hidden"
          style={{ background: '#fff', boxShadow: '0 1px 12px rgba(0,0,0,0.06)' }}>
          <div className="px-5 py-4 flex items-center justify-between border-b" style={{ borderColor: '#F0EDE8' }}>
            <h2 className="text-sm font-semibold" style={{ color: '#1C1917' }}>Pedidos recientes</h2>
            <Link href="/ventas"
              className="flex items-center gap-0.5 text-xs font-medium transition-all duration-150 hover:gap-1.5"
              style={{ color: '#8B5C2A' }}>
              Ver todos <ChevronRight size={13} />
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: '#F5F0EB' }}>
                <ShoppingCart size={22} style={{ color: '#D6D3D1' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: '#A8A29E' }}>Sin pedidos aún</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#FAFAF9' }}>
              {recentOrders.map((order: any, idx: number) => {
                const st      = ORDER_STATUS[order.status]
                const initials = getInitials(order.customer?.full_name)
                const avatarBg = AVATAR_COLORS[idx % AVATAR_COLORS.length]
                return (
                  <div key={order.id}
                    className="px-4 sm:px-5 py-3.5 flex items-center gap-3
                               transition-colors duration-150 hover:bg-amber-50 cursor-default">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full flex items-center justify-center
                                    text-xs font-bold shrink-0 select-none"
                      style={{ background: avatarBg + '1A', color: avatarBg }}>
                      {initials}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: '#1C1917' }}>
                        {order.customer?.full_name ?? 'Sin cliente'}
                      </p>
                      <p className="text-xs truncate mt-0.5" style={{ color: '#A8A29E' }}>
                        #{order.order_number} · {formatDateTime(order.created_at)}
                      </p>
                    </div>

                    {/* Status + amount */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-bold" style={{ color: '#1C1917' }}>
                        {formatCOP(order.total)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st?.color}`}>
                        {st?.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Stock bajo ───────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: '#fff', boxShadow: '0 1px 12px rgba(0,0,0,0.06)' }}>
          <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: '#F0EDE8' }}>
            <h2 className="text-sm font-semibold" style={{ color: '#1C1917' }}>Stock bajo</h2>
            <Link href="/inventario"
              className="flex items-center gap-0.5 text-xs font-medium transition-all duration-150 hover:gap-1.5"
              style={{ color: '#8B5C2A' }}>
              Inventario <ChevronRight size={13} />
            </Link>
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="py-14 text-center px-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: '#DCFCE7' }}>
                <Package size={20} style={{ color: '#16A34A' }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: '#16A34A' }}>Inventario en orden</p>
              <p className="text-xs mt-1" style={{ color: '#A8A29E' }}>Todos los productos bien abastecidos</p>
            </div>
          ) : (
            <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
              {lowStockProducts.map((p: any) => (
                <div key={p.id}
                  className="p-3.5 rounded-xl transition-colors duration-150 hover:bg-red-50 cursor-default"
                  style={{ background: '#FFF5F5', border: '1px solid #FEE2E2' }}>
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-xs font-semibold capitalize leading-snug" style={{ color: '#1C1917' }}>
                      {p.presentation} {p.type}
                    </p>
                    <span className="text-xs font-bold ml-2 shrink-0 px-1.5 py-0.5 rounded-md"
                      style={{ background: '#FEE2E2', color: '#EF4444' }}>
                      {p.stock} u.
                    </span>
                  </div>
                  <StockBar stock={p.stock} min={p.min_stock} />
                  <p className="text-xs mt-1.5" style={{ color: '#A8A29E' }}>
                    Mínimo: {p.min_stock} u.
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick actions ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: '/ventas',    label: 'Nueva venta',   icon: ShoppingCart, color: '#8B5C2A', bg: '#FDF6EE' },
          { href: '/clientes',  label: 'Clientes',      icon: Users,        color: '#3B82F6', bg: '#EFF6FF' },
          { href: '/productos', label: 'Productos',     icon: Package,      color: '#10B981', bg: '#F0FDF4' },
          { href: '/informes',  label: 'Informes',      icon: TrendingUp,   color: '#A855F7', bg: '#FAF5FF' },
        ].map(a => {
          const Icon = a.icon
          return (
            <Link key={a.href} href={a.href}
              className="flex items-center gap-3 p-4 rounded-2xl
                         transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95"
              style={{ background: a.bg, border: `1px solid ${a.color}18` }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: a.color + '18' }}>
                <Icon size={17} style={{ color: a.color }} />
              </div>
              <span className="text-xs font-semibold" style={{ color: '#1C1917' }}>{a.label}</span>
            </Link>
          )
        })}
      </div>

    </div>
  )
}
