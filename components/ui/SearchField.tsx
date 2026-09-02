'use client'

import { Search, X } from 'lucide-react'

/** Campo de búsqueda con icono y botón de limpiar. */
export function SearchField({
  value,
  onChange,
  placeholder = 'Buscar…',
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={`search-wrap ${className}`}>
      <Search size={15} className="search-icon" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="input-field"
        style={value ? { paddingRight: '2.25rem' } : undefined}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpiar búsqueda"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md"
          style={{ color: 'var(--muted-subtle)' }}>
          <X size={13} />
        </button>
      )}
    </div>
  )
}
