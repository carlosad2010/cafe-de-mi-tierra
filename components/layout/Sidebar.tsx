'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Users,
  ShoppingCart,
  FileText,
  UserCog,
  LogOut,
  Coffee,
  Wallet,
  ShoppingBag,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard, roles: ['admin', 'seller'] },
  { href: '/ventas',     label: 'Ventas',      icon: ShoppingCart,    roles: ['admin', 'seller'] },
  { href: '/clientes',   label: 'Clientes',    icon: Users,           roles: ['admin', 'seller'] },
  { href: '/productos',  label: 'Productos',   icon: Package,         roles: ['admin', 'seller'] },
  { href: '/inventario', label: 'Inventario',  icon: Warehouse,       roles: ['admin', 'seller'] },
  { href: '/facturas',   label: 'Facturas',    icon: FileText,        roles: ['admin', 'seller'] },
  { href: '/cajas',      label: 'Cajas',       icon: Wallet,          roles: ['admin', 'seller'] },
  { href: '/compras',    label: 'Compras y Gastos', icon: ShoppingBag, roles: ['admin', 'seller'] },
  { href: '/usuarios',   label: 'Usuarios',    icon: UserCog,         roles: ['admin'] },
]

export function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const visibleItems = navItems.filter(item => item.roles.includes(profile.role))

  return (
    <aside
      className="flex flex-col w-60 min-h-screen border-r"
      style={{ background: '#fff', borderColor: 'var(--border)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl" style={{ background: 'var(--primary)' }}>
          <Coffee size={18} color="#fdf8f3" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight" style={{ color: 'var(--foreground)' }}>Café de mi Tierra</p>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Gestión</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleItems.map(item => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className="sidebar-nav-link"
              style={isActive ? { background: 'var(--primary)', color: 'var(--primary-foreground)' } : {}}
            >
              <Icon size={17} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
        <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--muted)' }}>
          <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{profile.full_name}</p>
          <p className="text-xs capitalize" style={{ color: 'var(--muted-foreground)' }}>
            {profile.role === 'admin' ? 'Administrador' : 'Vendedor'}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="sidebar-nav-link w-full text-left"
          style={{ color: '#dc2626' }}
        >
          <LogOut size={17} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
