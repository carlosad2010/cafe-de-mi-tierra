'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Caja, MovimientoCaja, CajaTipo, MetodoPago } from '@/lib/types'
import { formatCOP, formatDateTime } from '@/lib/utils'
import { Wallet, Banknote, Plus, Pencil, TrendingUp, TrendingDown, X } from 'lucide-react'
import { useEscKey } from '@/lib/hooks/useEscKey'

type CajaWithBalance = Caja & { saldo_actual: number }
type MovimientoWithCaja = MovimientoCaja & {
  caja: Pick<Caja, 'nombre' | 'tipo'>
  orden: { customer: { full_name: string } | null } | null
}

const TIPO_LABELS: Record<CajaTipo, string> = { efectivo: 'Efectivo', bancaria: 'Bancaria' }

export function CajasClient({
  cajas: initialCajas,
  movimientos: initialMovimientos,
  metodosPago,
}: {
  cajas: CajaWithBalance[]
  movimientos: MovimientoWithCaja[]
  metodosPago: MetodoPago[]
}) {
  const [cajas, setCajas] = useState(initialCajas)
  const [movimientos] = useState(initialMovimientos)
  const [filterCajaTipo, setFilterCajaTipo] = useState<'todas' | 'efectivo' | 'bancaria'>('todas')
  const [filterTipo, setFilterTipo] = useState<'todos' | 'ingreso' | 'egreso'>('todos')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<CajaWithBalance | null>(null)
  const [form, setForm] = useState({ nombre: '', tipo: 'efectivo' as CajaTipo, saldo_inicial: '0', metodo_pago_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEscKey(() => setShowModal(false))

  function openCreate() {
    setEditing(null)
    setForm({ nombre: '', tipo: 'efectivo', saldo_inicial: '0', metodo_pago_id: '' })
    setError('')
    setShowModal(true)
  }

  function openEdit(caja: CajaWithBalance) {
    setEditing(caja)
    setForm({ nombre: caja.nombre, tipo: caja.tipo, saldo_inicial: String(caja.saldo_inicial), metodo_pago_id: caja.metodo_pago_id ?? '' })
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return }
    const saldo = Number(form.saldo_inicial)
    if (isNaN(saldo)) { setError('Saldo inicial inválido'); return }
    setSaving(true)
    setError('')
    const supabase = createClient()

    const metodoPagoId = form.metodo_pago_id || null

    if (editing) {
      const { data, error: err } = await supabase
        .from('cajas')
        .update({ nombre: form.nombre.trim(), saldo_inicial: saldo, metodo_pago_id: metodoPagoId, updated_at: new Date().toISOString() })
        .eq('id', editing.id)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      const metodo = metodosPago.find(m => m.id === metodoPagoId) ?? null
      setCajas(prev => prev.map(c => c.id === editing.id
        ? { ...data, metodo_pago: metodo ?? undefined, saldo_actual: saldo + (editing.saldo_actual - editing.saldo_inicial) }
        : c
      ))
    } else {
      const { data, error: err } = await supabase
        .from('cajas')
        .insert({ nombre: form.nombre.trim(), tipo: form.tipo, saldo_inicial: saldo, metodo_pago_id: metodoPagoId })
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      const metodo = metodosPago.find(m => m.id === metodoPagoId) ?? null
      setCajas(prev => [...prev, { ...data, metodo_pago: metodo ?? undefined, saldo_actual: saldo }])
    }

    setSaving(false)
    setShowModal(false)
  }

  async function toggleActiva(caja: CajaWithBalance) {
    const supabase = createClient()
    const { data } = await supabase
      .from('cajas')
      .update({ activa: !caja.activa, updated_at: new Date().toISOString() })
      .eq('id', caja.id)
      .select()
      .single()
    if (data) setCajas(prev => prev.map(c => c.id === caja.id ? { ...c, activa: data.activa } : c))
  }

  const movimientosFiltrados = movimientos
    .filter(m => filterCajaTipo === 'todas' || m.caja?.tipo === filterCajaTipo)
    .filter(m => filterTipo === 'todos' || m.tipo === filterTipo)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Cajas</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Saldos y movimientos</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <Plus size={16} /> Nueva Caja
        </button>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cajas.map(caja => (
          <div key={caja.id} className="rounded-2xl border p-5"
            style={{ background: '#fff', borderColor: 'var(--border)', opacity: caja.activa ? 1 : 0.5 }}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: caja.tipo === 'efectivo' ? '#d1fae5' : '#dbeafe' }}>
                  {caja.tipo === 'efectivo'
                    ? <Banknote size={18} style={{ color: '#065f46' }} />
                    : <Wallet size={18} style={{ color: '#1e40af' }} />}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{caja.nombre}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        background: caja.tipo === 'efectivo' ? '#d1fae5' : '#dbeafe',
                        color: caja.tipo === 'efectivo' ? '#065f46' : '#1e40af',
                      }}>
                      {TIPO_LABELS[caja.tipo]}
                    </span>
                    {(caja as any).metodo_pago?.nombre && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: 'var(--secondary)', color: 'var(--primary)' }}>
                        {(caja as any).metodo_pago.nombre}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => openEdit(caja)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <Pencil size={14} style={{ color: 'var(--muted-foreground)' }} />
              </button>
            </div>
            <p className="text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>Saldo actual</p>
            <p className="text-2xl font-bold" style={{ color: caja.saldo_actual >= 0 ? 'var(--primary)' : '#dc2626' }}>
              {formatCOP(caja.saldo_actual)}
            </p>
            {caja.saldo_inicial !== 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                Saldo inicial: {formatCOP(caja.saldo_inicial)}
              </p>
            )}
            {!caja.activa && (
              <button onClick={() => toggleActiva(caja)}
                className="mt-3 text-xs underline" style={{ color: 'var(--muted-foreground)' }}>
                Activar caja
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Movimientos */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Movimientos</h2>
          <div className="flex flex-wrap gap-4">
            {/* Filtro por tipo de caja */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Caja:</span>
              <div className="flex gap-1">
                {([
                  { key: 'todas', label: 'Todas' },
                  { key: 'efectivo', label: 'Efectivo' },
                  { key: 'bancaria', label: 'Bancaria' },
                ] as const).map(opt => (
                  <button key={opt.key} onClick={() => setFilterCajaTipo(opt.key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: filterCajaTipo === opt.key ? 'var(--primary)' : 'var(--secondary)',
                      color: filterCajaTipo === opt.key ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtro por tipo de movimiento */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Tipo:</span>
              <div className="flex gap-1">
                {([
                  { key: 'todos', label: 'Todos' },
                  { key: 'ingreso', label: 'Ingreso' },
                  { key: 'egreso', label: 'Egreso' },
                ] as const).map(opt => (
                  <button key={opt.key} onClick={() => setFilterTipo(opt.key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: filterTipo === opt.key ? 'var(--primary)' : 'var(--secondary)',
                      color: filterTipo === opt.key ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--secondary)' }}>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>Fecha</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Tipo</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Concepto</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>Caja</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {movimientosFiltrados.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{formatDateTime(m.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-xs font-medium w-fit px-2 py-0.5 rounded-full"
                      style={{
                        background: m.tipo === 'ingreso' ? '#d1fae5' : '#fee2e2',
                        color: m.tipo === 'ingreso' ? '#065f46' : '#991b1b',
                      }}>
                      {m.tipo === 'ingreso' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                    </span>
                  </td>
                  <td className="px-4 py-3 relative group" style={{ color: 'var(--foreground)' }}>
                    <span className="cursor-default">{m.concepto}</span>
                    {m.orden?.customer?.full_name && (
                      <div className="absolute left-4 bottom-full mb-1.5 z-20 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
                        <div className="text-xs px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap"
                          style={{ background: '#1a1a1a', color: '#f5f5f5' }}>
                          Cliente: {m.orden.customer.full_name}
                        </div>
                        <div className="w-2 h-2 rotate-45 mx-3"
                          style={{ background: '#1a1a1a', marginTop: '-4px' }} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{m.caja?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold"
                    style={{ color: m.tipo === 'ingreso' ? '#16a34a' : '#dc2626' }}>
                    {m.tipo === 'ingreso' ? '+' : '-'}{formatCOP(m.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {movimientosFiltrados.length === 0 && (
            <div className="py-16 text-center">
              <Wallet size={36} className="mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Sin movimientos</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal crear / editar caja */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-xl" style={{ background: '#fff' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
                {editing ? 'Editar caja' : 'Nueva caja'}
              </h2>
              <button onClick={() => setShowModal(false)}><X size={18} style={{ color: 'var(--muted-foreground)' }} /></button>
            </div>

            <div className="p-6 space-y-4">
              <Field label="Nombre *">
                <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Caja Principal" className="input-field" />
              </Field>

              {!editing && (
                <Field label="Tipo *">
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as CajaTipo }))}
                    className="input-field">
                    <option value="efectivo">Efectivo</option>
                    <option value="bancaria">Bancaria (transferencias)</option>
                  </select>
                </Field>
              )}

              <Field label="Método de pago asociado">
                <select
                  value={form.metodo_pago_id}
                  onChange={e => setForm(f => ({ ...f, metodo_pago_id: e.target.value }))}
                  className="input-field">
                  <option value="">— Sin método específico —</option>
                  {metodosPago.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
                <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                  Al completar una venta con este método, el ingreso se registrará en esta caja.
                </p>
              </Field>

              <Field label="Saldo inicial">
                <input type="number" min="0" step="100" value={form.saldo_inicial}
                  onChange={e => setForm(f => ({ ...f, saldo_inicial: e.target.value }))}
                  className="input-field" />
              </Field>

              {editing && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm" style={{ color: 'var(--foreground)' }}>Caja activa</span>
                  <button onClick={() => toggleActiva(editing)}
                    className="w-10 h-5 rounded-full transition-colors relative"
                    style={{ background: editing.activa ? 'var(--primary)' : 'var(--border)' }}>
                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                      style={{ left: editing.activa ? '1.25rem' : '0.125rem' }} />
                  </button>
                </div>
              )}

              {error && (
                <p className="text-sm p-3 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                  {saving ? 'Guardando...' : 'Guardar'}
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
