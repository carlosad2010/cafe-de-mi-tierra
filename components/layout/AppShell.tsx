'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, Coffee } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Profile } from '@/lib/types'

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <div className="flex min-h-screen">

      {/* ── Mobile backdrop ── */}
      <div
        className={`fixed inset-0 z-30 transition-opacity duration-300 lg:hidden ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(3px)' }}
        onClick={() => setOpen(false)}
      />

      {/* ── Sidebar — fixed on mobile, relative on desktop ── */}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <Sidebar profile={profile} onClose={() => setOpen(false)} />
      </div>

      {/* ── Content column ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Mobile top bar */}
        <header
          className="lg:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b"
          style={{ background: '#fff', borderColor: 'var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <button
            onClick={() => setOpen(true)}
            className="p-2 rounded-xl transition-all duration-150 hover:scale-105 active:scale-95"
            style={{ background: 'var(--secondary)', color: 'var(--primary)' }}
            aria-label="Abrir menú">
            <Menu size={19} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary)' }}>
              <Coffee size={13} color="#fdf8f3" />
            </div>
            <span className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>Café de mi Tierra</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto" style={{ background: 'var(--background)' }}>
          {children}
        </main>

      </div>
    </div>
  )
}
