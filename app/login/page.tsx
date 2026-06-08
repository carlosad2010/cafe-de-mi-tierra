'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Correo o contraseña incorrectos')
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ backgroundColor: '#8b5e3c' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M8 24C8 24 6 20 6 16C6 12 8 8 16 8C24 8 26 12 26 16C26 20 24 24 24 24" stroke="#fdf8f3" strokeWidth="2" strokeLinecap="round"/>
              <path d="M10 24H22" stroke="#fdf8f3" strokeWidth="2" strokeLinecap="round"/>
              <path d="M12 28H20" stroke="#fdf8f3" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="16" cy="16" r="3" fill="#fdf8f3"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
            Café de mi Tierra
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
            Sistema de gestión
          </p>
        </div>

        {/* Form */}
        <div className="rounded-2xl border p-8 shadow-sm" style={{ background: '#fff', borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold mb-6" style={{ color: 'var(--foreground)' }}>
            Iniciar sesión
          </h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="tu@correo.com"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all"
                style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all"
                style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
              />
            </div>

            {error && (
              <p className="text-sm rounded-lg px-3 py-2.5" style={{ background: '#fef2f2', color: '#dc2626' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
