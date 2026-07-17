import { createClient } from '@/lib/supabase/server'
import { DashboardClient } from './DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [
    { data: todayOrders },
    { data: monthOrders },
    { data: lowStock },
    customersResult,
    { data: recentOrders },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('total, subtotal, id')
      .eq('status', 'completado')
      .gte('created_at', today.toISOString()),
    supabase
      .from('orders')
      .select('total, id, created_at')
      .eq('status', 'completado')
      .gte('created_at', monthStart.toISOString()),
    supabase.from('low_stock_products').select('id, name, stock, min_stock, presentation, type'),
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase
      .from('orders')
      .select('*, customer:customers(full_name), seller:profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const todayRevenue = (todayOrders ?? []).reduce((s, o) => s + Number(o.total), 0)
  const monthRevenue = (monthOrders ?? []).reduce((s, o) => s + Number(o.total), 0)

  const stats = {
    today_revenue: todayRevenue,
    today_orders: (todayOrders ?? []).length,
    month_revenue: monthRevenue,
    month_orders: (monthOrders ?? []).length,
    low_stock_count: (lowStock ?? []).length,
    total_customers: customersResult.count ?? 0,
  }

  return (
    <DashboardClient
      stats={stats}
      lowStockProducts={lowStock ?? []}
      recentOrders={recentOrders ?? []}
    />
  )
}
