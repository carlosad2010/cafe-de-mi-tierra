/**
 * Barra de stock: compara la existencia contra el mínimo configurado.
 * La barra se llena hasta 3x el mínimo (el punto donde "hay de sobra"
 * deja de ser interesante) y cambia de color en dos umbrales:
 * por debajo del mínimo (crítico) y hasta 1.5x el mínimo (ajustado).
 */
export function StockBar({ stock, minStock }: { stock: number; minStock: number }) {
  const target = Math.max(minStock * 3, 1)
  const ratio  = Math.min(1, Math.max(0, stock / target))

  const state: 'critico' | 'ajustado' | 'saludable' =
    stock <= minStock ? 'critico' : stock <= minStock * 1.5 ? 'ajustado' : 'saludable'

  const color = state === 'critico' ? '#dc2626' : state === 'ajustado' ? '#d97706' : '#16a34a'

  return (
    <div className="flex items-center gap-2" style={{ minWidth: '5.5rem' }}>
      <span
        className="tabular-nums text-sm"
        style={{ color, fontWeight: state === 'critico' ? 600 : 500, minWidth: '1.5rem' }}>
        {stock}
      </span>
      <div className="stock-bar-track">
        <div className="stock-bar-fill" style={{ width: `${ratio * 100}%`, background: color }} />
      </div>
    </div>
  )
}
