/**
 * Esqueleto de página para los `loading.tsx` de cada módulo.
 *
 * Se renderiza en el servidor mientras la página real espera sus datos, de
 * modo que al navegar aparece de inmediato la forma de la pantalla en vez de
 * quedarse congelada en la anterior.
 */
export function PageSkeleton({
  kpis = 0,
  rows = 8,
  columns = 6,
  filters = false,
}: {
  kpis?: number
  rows?: number
  columns?: number
  filters?: boolean
}) {
  return (
    <div className="page-wrapper" aria-busy="true" aria-label="Cargando">
      {/* Encabezado */}
      <div className="page-header">
        <div className="flex-1">
          <div className="skeleton" style={{ height: '1.75rem', width: '11rem' }} />
          <div className="skeleton" style={{ height: '0.8rem', width: '8rem', marginTop: '0.6rem' }} />
        </div>
        <div className="skeleton" style={{ height: '2.25rem', width: '9rem', borderRadius: '0.625rem' }} />
      </div>

      {/* KPIs */}
      {kpis > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: kpis }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '6.5rem', borderRadius: '1rem' }} />
          ))}
        </div>
      )}

      {/* Buscador y filtros */}
      {filters && (
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="skeleton" style={{ height: '2.25rem', width: '16rem', borderRadius: '0.625rem' }} />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '2.25rem', width: '6rem', borderRadius: '9999px' }} />
          ))}
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#fff', borderColor: 'var(--border)' }}>
        <div className="flex gap-4 px-4 py-3" style={{ background: 'var(--secondary)' }}>
          {Array.from({ length: columns }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '0.75rem', flex: i === 0 ? '0 0 3rem' : 1 }} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="flex gap-4 px-4 py-3.5 items-center"
            style={{ borderTop: '1px solid var(--border-light)', opacity: 1 - r * 0.07 }}>
            {Array.from({ length: columns }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '0.85rem', flex: i === 0 ? '0 0 3rem' : 1 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
