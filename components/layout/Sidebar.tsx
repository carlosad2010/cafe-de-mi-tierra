'use client'

import Image from 'next/image'
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
  Wallet,
  HandCoins,
  ShoppingBag,
  Settings,
  BarChart2,
  X,
} from 'lucide-react'

type NavItem = { href: string; label: string; icon: React.ElementType; roles: string[] }
type NavGroup = { label: string | null; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'seller'] },
    ],
  },
  {
    label: 'Operación',
    items: [
      { href: '/ventas',     label: 'Ventas',     icon: ShoppingCart, roles: ['admin', 'seller'] },
      { href: '/clientes',   label: 'Clientes',   icon: Users,        roles: ['admin', 'seller'] },
      { href: '/productos',  label: 'Productos',  icon: Package,      roles: ['admin', 'seller'] },
      { href: '/inventario', label: 'Inventario', icon: Warehouse,    roles: ['admin', 'seller'] },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { href: '/facturas',       label: 'Facturas',         icon: FileText,    roles: ['admin', 'seller'] },
      { href: '/cuentas-cobrar', label: 'Cuentas x Cobrar', icon: HandCoins,   roles: ['admin', 'seller'] },
      { href: '/cajas',          label: 'Cajas',            icon: Wallet,      roles: ['admin', 'seller'] },
      { href: '/compras',        label: 'Compras y Gastos', icon: ShoppingBag, roles: ['admin', 'seller'] },
      { href: '/informes',       label: 'Informes',         icon: BarChart2,   roles: ['admin', 'seller'] },
    ],
  },
  {
    label: 'Administración',
    items: [
      { href: '/usuarios',      label: 'Usuarios',      icon: UserCog,  roles: ['admin'] },
      { href: '/configuracion', label: 'Configuración', icon: Settings, roles: ['admin'] },
    ],
  },
]

/** Iniciales del nombre — máximo dos letras. */
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function Sidebar({ profile, onClose }: { profile: Profile; onClose?: () => void }) {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const groups = navGroups
    .map(g => ({ ...g, items: g.items.filter(i => i.roles.includes(profile.role)) }))
    .filter(g => g.items.length > 0)

  // Índice global para escalonar la animación de entrada
  let itemIndex = 0

  return (
    <aside
      className="flex flex-col w-64 h-screen border-r"
      style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--border)' }}>

      {/* ── Logo ── */}
      <div
        className="relative flex items-center justify-center px-4 py-5 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <Link href="/dashboard" className="block" aria-label="Café de mi Tierra">
          <Image
            src="/logo.png"
            alt="Café de mi Tierra"
            width={112}
            height={127}
            priority
            className="w-24 h-auto"
          />
        </Link>
        {/* Close — only on mobile */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden absolute right-3 top-3 p-1.5 rounded-lg transition-all duration-150 hover:scale-110 active:scale-90"
            style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}
            aria-label="Cerrar menú">
            <X size={15} />
          </button>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {groups.map(group => (
          <div key={group.label ?? 'main'} className="mb-1">
            {group.label && <span className="sidebar-section-label">{group.label}</span>}
            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon     = item.icon
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                const delay    = `${0.03 * itemIndex++}s`
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-active={isActive}
                    className="sidebar-nav-link fade-in"
                    style={{ animationDelay: delay }}>
                    <Icon size={17} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── User ── */}
      <div className="px-3 py-4 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
          style={{ background: 'var(--secondary)' }}>
          <span
            className="flex items-center justify-center w-9 h-9 rounded-full text-xs font-bold shrink-0"
            style={{
              background: profile.role === 'admin' ? 'var(--primary)' : 'var(--accent)',
              color: 'var(--primary-foreground)',
            }}>
            {initials(profile.full_name)}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>
              {profile.full_name}
            </p>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {profile.role === 'admin' ? 'Administrador' : 'Vendedor'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          title="Salir del sistema"
          className="sidebar-nav-link w-full text-left"
          style={{ color: 'var(--danger)' }}>
          <LogOut size={17} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
