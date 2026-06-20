export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const hasError = !!params?.error

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ backgroundColor: '#8b5e3c' }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M8 24C8 24 6 20 6 16C6 12 8 8 16 8C24 8 26 12 26 16C26 20 24 24 24 24" stroke="#fdf8f3" strokeWidth="2" strokeLinecap="round" />
              <path d="M10 24H22" stroke="#fdf8f3" strokeWidth="2" strokeLinecap="round" />
              <path d="M12 28H20" stroke="#fdf8f3" strokeWidth="2" strokeLinecap="round" />
              <circle cx="16" cy="16" r="3" fill="#fdf8f3" />
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

          <form method="POST" action="/api/auth/login" className="space-y-4" id="login-form">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                Correo electrónico
              </label>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
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
                name="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all"
                style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
              />
            </div>

            {hasError && (
              <p
                className="text-sm rounded-lg px-3 py-2.5"
                style={{ background: '#fef2f2', color: '#dc2626' }}
              >
                Correo o contraseña incorrectos
              </p>
            )}

            <button
              type="submit"
              id="login-btn"
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              Ingresar
            </button>
          </form>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.getElementById('login-form').addEventListener('submit', function() {
              var btn = document.getElementById('login-btn');
              btn.disabled = true;
              btn.textContent = 'Ingresando...';
              btn.style.opacity = '0.6';
            });
          `,
        }}
      />
    </div>
  )
}
