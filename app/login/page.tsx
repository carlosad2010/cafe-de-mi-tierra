'use client'

import { useState } from 'react'
import Image from 'next/image'

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  return <LoginForm searchParamsPromise={searchParams} />
}

function LoginForm({ searchParamsPromise }: { searchParamsPromise: Promise<{ error?: string }> }) {
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [params, setParams] = useState<{ error?: string }>({})

  // Resolve params on mount
  useState(() => {
    searchParamsPromise.then(p => setParams(p ?? {}))
  })

  const hasError = !!params?.error

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--background)' }}>

      {/* ── Left: decorative panel (desktop only) ── */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center relative overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #3d2815 0%, #6b4423 40%, #8b5e3c 70%, #a8845c 100%)',
        }}>

        {/* Decorative blobs */}
        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full"
          style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="absolute bottom-10 -right-16 w-96 h-96 rounded-full"
          style={{ background: 'rgba(255,255,255,0.03)' }} />
        <div className="absolute top-1/4 right-10 w-24 h-24 rounded-full"
          style={{ background: 'rgba(196,131,42,0.15)' }} />

        {/* Content */}
        <div className="relative z-10 text-center px-12 fade-in">
          <div className="w-44 h-44 mx-auto mb-6 relative">
            <Image
              src="/logo.png"
              alt="Café de mi Tierra"
              width={176}
              height={176}
              className="object-contain drop-shadow-2xl"
              style={{ filter: 'brightness(0) invert(1) brightness(0.95)' }}
              priority
            />
          </div>
          <h2 className="text-2xl font-bold text-white/90 mb-3 text-heading"
            style={{ letterSpacing: '-0.02em' }}>
            Sistema de Gestión
          </h2>
          <p className="text-white/50 text-sm leading-relaxed max-w-xs mx-auto">
            Controla tus ventas, inventario, clientes y finanzas en un solo lugar.
          </p>

          {/* Bottom decorative dots */}
          <div className="flex items-center justify-center gap-2 mt-10">
            <span className="w-2 h-2 rounded-full" style={{ background: 'rgba(196,131,42,0.6)' }} />
            <span className="w-3 h-3 rounded-full" style={{ background: 'rgba(196,131,42,0.8)' }} />
            <span className="w-2 h-2 rounded-full" style={{ background: 'rgba(196,131,42,0.6)' }} />
          </div>
        </div>
      </div>

      {/* ── Right: login form ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm fade-in">

          {/* Mobile logo */}
          <div className="text-center mb-8 lg:mb-10">
            <div className="lg:hidden w-20 h-20 mx-auto mb-4 relative">
              <Image
                src="/logo.png"
                alt="Café de mi Tierra"
                width={80}
                height={80}
                className="object-contain"
                priority
              />
            </div>
            <h1 className="text-heading text-2xl font-bold" style={{ color: 'var(--foreground)', letterSpacing: '-0.02em' }}>
              Café de mi Tierra
            </h1>
            <p className="text-sm mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
              Inicia sesión para continuar
            </p>
          </div>

          {/* Form card */}
          <div
            className="rounded-2xl p-7 sm:p-8"
            style={{
              background: '#fff',
              border: '1px solid var(--border-light)',
              boxShadow: 'var(--shadow-lg)',
            }}>

            <form
              method="POST"
              action="/api/auth/login"
              className="space-y-5"
              id="login-form"
              onSubmit={() => setLoading(true)}>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--foreground)' }}>
                  Correo electrónico
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  className="input-field focus-ring"
                  style={{ padding: '0.625rem 0.875rem' }}
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--foreground)' }}>
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="input-field focus-ring"
                    style={{ padding: '0.625rem 0.875rem', paddingRight: '2.75rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md"
                    style={{ color: 'var(--muted-subtle)' }}
                    tabIndex={-1}>
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {hasError && (
                <div className="flex items-center gap-2 text-sm rounded-xl px-4 py-3"
                  style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                  Correo o contraseña incorrectos
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl py-3 text-sm font-semibold transition-all duration-200 disabled:opacity-60"
                style={{
                  background: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  boxShadow: '0 4px 14px rgba(124,92,66,0.3)',
                }}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25"/>
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                    Ingresando...
                  </span>
                ) : 'Ingresar'}
              </button>
            </form>
          </div>

          {/* Footer */}
          <p className="text-center text-xs mt-6" style={{ color: 'var(--muted-subtle)' }}>
            © {new Date().getFullYear()} Café de mi Tierra · Todos los derechos reservados
          </p>
        </div>
      </div>
    </div>
  )
}
