'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Caja, Compra, TipoGasto } from '@/lib/types'
import { formatCOP, formatDate } from '@/lib/utils'
import { Plus, ShoppingBag, Pencil, Trash2, X, Banknote, Wallet, Tag, Receipt } from 'lucide-react'
import { useEscKey } from '@/lib/hooks/useEscKey'
import { EmptyState } from '@/components/ui/EmptyState'
import { useCanWrite } from '@/lib/perfil-context'
import { SearchField } from '@/components/ui/SearchField'
import { Pagination } from '@/components/ui/Pagination'

type CompraFull = Compra & {
  caja?: Pick<Caja, 'nombre' | 'tipo'>
  creator?: { full_name: string }
}

const EMPTY_FORM = {
  tipo: 'compra' as TipoGasto,
  concepto: '',
  proveedor: '',
  monto: '',
  caja_id: '',
  fecha: new Date().toISOString().slice(0, 10),
  notas: '',
}

const TIPO_CONFIG: Record<TipoGasto, { label: string; color: string; bg: string }> = {
  compra: { label: 'Compra',  color: '#92400e', bg: '#fef3c7' },
  gasto:  { label: 'Gasto',   color: '#1e40af', bg: '#dbeafe' },
}

export function ComprasClient({
  compras: initialCompras,
  cajas,
  page, pageSize, total, tipo, query, conteos, resumen,
}: {
  compras: CompraFull[]
  cajas: Pick<Caja, 'id' | 'nombre' | 'tipo'>[]
  page: number
  pageSize: number
  total: number
  tipo: string
  query: string
  conteos: Record<string, number>
  resumen: { compras: number; gastos: number; efectivo: number; bancaria: number; registros: number }
}) {
  const canWrite = useCanWrite()
  const router   = useRouter()
  const pathname = usePathname()
  const [navigating, startNavigation] = useTransition()

  // El servidor entrega la pagina ya filtrada; el estado local solo absorbe
  // las altas, ediciones y borrados.
  const [compras, setCompras] = useState(initialCompras)
  const [seed, setSeed]       = useState(initialCompras)
  if (seed !== initialCompras) {
    setSeed(initialCompras)
    setCompras(initialCompras)
  }
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<CompraFull | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM, caja_id: cajas[0]?.id ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  // Texto del buscador: local para no perder el foco entre navegaciones
  const [search, setSearch] = useState(query)

  /** Reescribe la URL con los filtros activos; el servidor devuelve la pagina. */
  function navigate(next: { tipo?: string; q?: string; page?: number }) {
    const params   = new URLSearchParams()
    const nextTipo = next.tipo ?? tipo
    const nextQ    = (next.q ?? query).trim()
    const nextPage = next.page ?? 1
    if (nextTipo !== 'todos') params.set('tipo', nextTipo)
    if (nextQ)                params.set('q', nextQ)
    if (nextPage > 1)         params.set('page', String(nextPage))
    const qs = params.toString()
    startNavigation(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  // Busqueda con retardo: evita una consulta por cada tecla
  useEffect(() => {
    if (search.trim() === query) return
    const timer = setTimeout(() => navigate({ q: search, page: 1 }), 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // Candado síncrono: `saving` no basta, setState es asíncrono y dos clics
  // en el mismo tick lo atraviesan antes del re-render que deshabilita el botón.
  const savingRef = useRef(false)

  useEscKey(() => setShowModal(false))

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, caja_id: cajas[0]?.id ?? '', fecha: new Date().toISOString().slice(0, 10) })
    setError('')
    setShowModal(true)
  }

  function openEdit(c: CompraFull) {
    setEditing(c)
    setForm({
      tipo: c.tipo,
      concepto: c.concepto,
      proveedor: c.proveedor ?? '',
      monto: String(c.monto),
      caja_id: c.caja_id,
      fecha: c.fecha.slice(0, 10),
      notas: c.notas ?? '',
    })
    setError('')
    setShowModal(true)
  }

  function finishSaving() {
    savingRef.current = false
    setSaving(false)
  }

  async function handleSave() {
    if (savingRef.current) return
    if (!form.concepto.trim()) { setError('El concepto es requerido'); return }
    if (!form.monto || Number(form.monto) <= 0) { setError('El monto debe ser mayor a 0'); return }
    if (!form.caja_id) { setError('Selecciona una caja'); return }
    savingRef.current = true
    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const monto = Number(form.monto)

    if (editing) {
      const updates = {
        tipo: form.tipo,
        concepto: form.concepto.trim(),
        proveedor: form.proveedor.trim() || null,
        monto,
        caja_id: form.caja_id,
        fecha: new Date(form.fecha).toISOString(),
        notas: form.notas.trim() || null,
      }
      const { error: err } = await supabase.from('compras').update(updates).eq('id', editing.id)
      if (err) { setError(err.message); finishSaving(); return }

      if (editing.movimiento_id) {
        await supabase.from('movimientos_caja').update({
          concepto: form.concepto.trim(),
          monto,
          caja_id: form.caja_id,
          fecha: new Date(form.fecha).toISOString(),
        }).eq('id', editing.movimiento_id)
      }

      const caja = cajas.find(c => c.id === form.caja_id)
      setCompras(prev => prev.map(c => c.id === editing.id
        ? { ...c, ...updates, caja: caja ? { nombre: caja.nombre, tipo: caja.tipo } : c.caja }
        : c
      ))
    } else {
      const { data: mov, error: movErr } = await supabase
        .from('movimientos_caja')
        .insert({
          caja_id: form.caja_id,
          tipo: 'egreso',
          concepto: form.concepto.trim(),
          monto,
          fecha: new Date(form.fecha).toISOString(),
          created_by: user?.id ?? null,
        })
        .select('id')
        .single()

      if (movErr) { setError(movErr.message); finishSaving(); return }

      const { data: compra, error: compraErr } = await supabase
        .from('compras')
        .insert({
          tipo: form.tipo,
          concepto: form.concepto.trim(),
          proveedor: form.proveedor.trim() || null,
          monto,
          caja_id: form.caja_id,
          movimiento_id: mov.id,
          fecha: new Date(form.fecha).toISOString(),
          notas: form.notas.trim() || null,
          created_by: user?.id ?? null,
        })
        .select('*, caja:cajas(nombre, tipo), creator:profiles(full_name)')
        .single()

      if (compraErr) {
        // El egreso ya está confirmado en la base. Si la compra no se pudo crear,
        // deshacerlo o quedaría un egreso fantasma descontando el saldo de la caja
        // sin ninguna compra que lo respalde.
        await supabase.from('movimientos_caja').delete().eq('id', mov.id)
        setError(compraErr.message)
        finishSaving()
        return
      }
      setCompras(prev => [compra as CompraFull, ...prev])
    }

    finishSaving()
    setShowModal(false)
  }

  async function handleDelete(c: CompraFull) {
    if (!confirm(`¿Eliminar "${c.concepto}"? También se eliminará el movimiento de caja.`)) return
    setDeleting(c.id)
    const supabase = createClient()

    const { error: compraErr } = await supabase.from('compras').delete().eq('id', c.id)
    if (compraErr) { alert(`No se pudo eliminar: ${compraErr.message}`); setDeleting(null); return }

    if (c.movimiento_id) {
      const { error: movErr } = await supabase.from('movimientos_caja').delete().eq('id', c.movimiento_id)
      // La compra ya se borró; si el egreso sobrevive queda descontando saldo sin respaldo.
      if (movErr) alert(`Compra eliminada, pero su movimiento de caja sigue activo (${movErr.message}). Elimínalo desde Cajas.`)
    }

    setCompras(prev => prev.filter(x => x.id !== c.id))
    setDeleting(null)
  }


  const hasFilters = !!query || tipo !== 'todos'

  return (
    <div className="page-wrapper space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Compras y Gastos</h1>
          <p className="page-subtitle">
            {hasFilters ? `${total} de ${resumen.registros} registros` : `${resumen.registros} registros`}
          </p>
        </div>
        {canWrite && (
          <button onClick={openCreate} className="btn btn-primary">
            <Plus size={16} /> Registrar
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon={<Tag size={18} style={{ color: '#92400e' }} />} bg="#fef3c7"
          label="Total compras" value={formatCOP(resumen.compras)} valueColor="#dc2626" />
        <SummaryCard icon={<Receipt size={18} style={{ color: '#1e40af' }} />} bg="#dbeafe"
          label="Total gastos" value={formatCOP(resumen.gastos)} valueColor="#dc2626" />
        <SummaryCard icon={<Banknote size={18} style={{ color: '#065f46' }} />} bg="#d1fae5"
          label="Salida efectivo" value={formatCOP(resumen.efectivo)} valueColor="#dc2626" />
        <SummaryCard icon={<Wallet size={18} style={{ color: '#1e40af' }} />} bg="#dbeafe"
          label="Salida bancaria" value={formatCOP(resumen.bancaria)} valueColor="#dc2626" />
      </div>

      {/* Busqueda y filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Buscar por concepto o proveedor…"
          className="w-full sm:w-72"
        />
        <div className="flex gap-2 flex-wrap">
          {(['todos', 'compra', 'gasto'] as const).map(t => (
            <button
              key={t}
              onClick={() => navigate({ tipo: t, page: 1 })}
              data-active={tipo === t}
              className="filter-pill capitalize">
              {t === 'todos' ? 'Todos' : TIPO_CONFIG[t].label + 's'}
              <span className="text-xs opacity-70">{conteos[t] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
        <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Concepto</th>
              <th className="hidden sm:table-cell">Proveedor</th>
              <th>Monto</th>
              <th className="hidden sm:table-cell">Caja</th>
              <th className="hidden sm:table-cell">Fecha</th>
              <th className="hidden sm:table-cell">Notas</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {compras.map(c => {
              const cfg = TIPO_CONFIG[c.tipo]
              return (
                <tr key={c.id}>
                  <td>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: cfg.bg, color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </td>
                  <td className="font-medium" style={{ color: 'var(--foreground)' }}>{c.concepto}</td>
                  <td className="hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{c.proveedor ?? '—'}</td>
                  <td className="font-semibold" style={{ color: '#dc2626' }}>{formatCOP(c.monto)}</td>
                  <td className="hidden sm:table-cell">
                    {c.caja && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: c.caja.tipo === 'efectivo' ? '#d1fae5' : '#dbeafe',
                          color: c.caja.tipo === 'efectivo' ? '#065f46' : '#1e40af',
                        }}>
                        {c.caja.nombre}
                      </span>
                    )}
                  </td>
                  <td className="text-xs hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{formatDate(c.fecha)}</td>
                  <td className="text-xs max-w-[160px] truncate hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>
                    {c.notas ?? '—'}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {canWrite && (
                        <>
                          <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-blue-50">
                            <Pencil size={14} style={{ color: '#2563eb' }} />
                          </button>
                          <button onClick={() => handleDelete(c)} disabled={deleting === c.id}
                            className="p-1.5 rounded-lg hover:bg-red-50 disabled:opacity-40">
                            <Trash2 size={14} style={{ color: '#dc2626' }} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        {compras.length === 0 && (
          <EmptyState
            icon={ShoppingBag}
            title={hasFilters ? 'Sin resultados' : 'Sin registros'}
            description={hasFilters
              ? 'Ningun registro coincide con la busqueda o el filtro aplicado.'
              : 'Registra compras y gastos para verlos reflejados en tus informes.'}
          />
        )}
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          busy={navigating}
          onPageChange={p => navigate({ page: p })}
        />
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box modal-box-flush" style={{ maxWidth: '28rem' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
                {editing ? 'Editar registro' : 'Nuevo registro'}
              </h2>
              <button onClick={() => setShowModal(false)}><X size={18} style={{ color: 'var(--muted-foreground)' }} /></button>
            </div>

            <div className="p-6 space-y-4">
              {/* Tipo selector */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Tipo *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['compra', 'gasto'] as TipoGasto[]).map(t => {
                    const cfg = TIPO_CONFIG[t]
                    const active = form.tipo === t
                    return (
                      <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tipo: t }))}
                        className="py-2.5 rounded-xl text-sm font-semibold border-2 transition-all"
                        style={{
                          borderColor: active ? cfg.color : 'var(--border)',
                          background: active ? cfg.bg : 'transparent',
                          color: active ? cfg.color : 'var(--muted-foreground)',
                        }}>
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Field label="Concepto *">
                <input type="text" value={form.concepto}
                  onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
                  placeholder={form.tipo === 'compra' ? 'Ej: Café verde 250g' : 'Ej: Servicio de internet'}
                  className="input-field" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Proveedor">
                  <input type="text" value={form.proveedor}
                    onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}
                    placeholder="Nombre" className="input-field" />
                </Field>
                <Field label="Monto *">
                  <input type="number" min="1" step="100" value={form.monto}
                    onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                    placeholder="0" className="input-field" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Caja *">
                  <select value={form.caja_id}
                    onChange={e => setForm(f => ({ ...f, caja_id: e.target.value }))}
                    className="input-field">
                    {cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </Field>
                <Field label="Fecha *">
                  <input type="date" value={form.fecha}
                    onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                    className="input-field" />
                </Field>
              </div>

              <Field label="Notas">
                <textarea value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className="input-field resize-none" rows={2}
                  placeholder="Descripción adicional..." />
              </Field>

              {error && (
                <p className="text-sm p-3 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)}
                  className="btn btn-secondary flex-1">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="btn btn-primary flex-1">
                  {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Registrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`.input-field { width:100%; border-radius:0.5rem; border:1px solid var(--border); padding:0.5rem 0.75rem; font-size:0.875rem; background:var(--background); outline:none; }`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>{label}</label>
      {children}
    </div>
  )
}

function SummaryCard({ icon, bg, label, value, valueColor }: {
  icon: React.ReactNode; bg: string; label: string; value: string; valueColor: string
}) {
  return (
    <div className="rounded-2xl border p-4 flex items-center gap-3"
      style={{ background: '#fff', borderColor: 'var(--border)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
        <p className="text-base font-bold" style={{ color: valueColor }}>{value}</p>
      </div>
    </div>
  )
}
