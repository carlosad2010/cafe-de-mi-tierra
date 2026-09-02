'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Paginación de servidor. `onPageChange` recibe la página destino (1-based);
 * quien la usa se encarga de reflejarla en la URL.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  busy = false,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  busy?: boolean
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null

  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t"
      style={{ borderColor: 'var(--border-light)' }}>
      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
        Mostrando <strong style={{ color: 'var(--foreground)' }}>{from}–{to}</strong> de{' '}
        <strong style={{ color: 'var(--foreground)' }}>{total}</strong>
      </p>
      <div className="flex items-center gap-2">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={busy || page <= 1}>
          <ChevronLeft size={14} /> Anterior
        </button>
        <span className="text-xs tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
          {page} / {totalPages}
        </span>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={busy || page >= totalPages}>
          Siguiente <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
