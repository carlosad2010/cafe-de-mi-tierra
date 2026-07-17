'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Caja, Compra, TipoGasto } from '@/lib/types'
import { formatCOP, formatDate } from '@/lib/utils'
import { Plus, ShoppingBag, Pencil, Trash2, X, Banknote, Wallet, Tag, Receipt } from 'lucide-react'

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
}: {
  compras: CompraFull[]
  cajas: Pick<Caja, 'id' | 'nombre' | 'tipo'>[]
}) {
  const [compras, setCompras] = useState(initialCompras)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<CompraFull | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM, caja_id: cajas[0]?.id ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filterTipo, setFilterTipo] = useState<'todos' | TipoGasto>('todos')

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

  async function handleSave() {
    if (!form.concepto.trim()) { setError('El concepto es requerido'); return }
    if (!form.monto || Number(form.monto) <= 0) { setError('El monto debe ser mayor a 0'); return }
    if (!form.caja_id) { setError('Selecciona una caja'); return }
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
      if (err) { setError(err.message); setSaving(false); return }

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

      if (movErr) { setError(movErr.message); setSaving(false); return }

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

      if (compraErr) { setError(compraErr.message); setSaving(false); return }
      setCompras(prev => [compra as CompraFull, ...prev])
    }

    setSaving(false)
    setShowModal(false)
  }

  async function handleDelete(c: CompraFull) {
    if (!confirm(`¿Eliminar "${c.concepto}"? También se eliminará el movimiento de caja.`)) return
    setDeleting(c.id)
    const supabase = createClient()
    await supabase.from('compras').delete().eq('id', c.id)
    if (c.movimiento_id) await supabase.from('movimientos_caja').delete().eq('id', c.movimiento_id)
    setCompras(prev => prev.filter(x => x.id !== c.id))
    setDeleting(null)
  }

  const filtered = filterTipo === 'todos' ? compras : compras.filter(c => c.tipo === filterTipo)

  const totalCompras  = compras.filter(c => c.tipo === 'compra').reduce((s, c) => s + c.monto, 0)
  const totalGastos   = compras.filter(c => c.tipo === 'gasto').reduce((s, c) => s + c.monto, 0)
  const totalEfectivo = compras.filter(c => c.caja?.tipo === 'efectivo').reduce((s, c) => s + c.monto, 0)
  const totalBancaria = compras.filter(c => c.caja?.tipo === 'bancaria').reduce((s, c) => s + c.monto, 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Compras y Gastos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{compras.length} registros</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <Plus size={16} /> Registrar
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon={<Tag size={18} style={{ color: '#92400e' }} />} bg="#fef3c7"
          label="Total compras" value={formatCOP(totalCompras)} valueColor="#dc2626" />
        <SummaryCard icon={<Receipt size={18} style={{ color: '#1e40af' }} />} bg="#dbeafe"
          label="Total gastos" value={formatCOP(totalGastos)} valueColor="#dc2626" />
        <SummaryCard icon={<Banknote size={18} style={{ color: '#065f46' }} />} bg="#d1fae5"
          label="Salida efectivo" value={formatCOP(totalEfectivo)} valueColor="#dc2626" />
        <SummaryCard icon={<Wallet size={18} style={{ color: '#1e40af' }} />} bg="#dbeafe"
          label="Salida bancaria" value={formatCOP(totalBancaria)} valueColor="#dc2626" />
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['todos', 'compra', 'gasto'] as const).map(t => (
          <button key={t} onClick={() => setFilterTipo(t)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
            style={{
              background: filterTipo === t ? 'var(--primary)' : 'var(--secondary)',
              color: filterTipo === t ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            }}>
            {t === 'todos' ? 'Todos' : TIPO_CONFIG[t].label + 's'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
        <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: '600px' }}>
          <thead>
            <tr style={{ background: 'var(--secondary)' }}>
              {['Tipo', 'Concepto', 'Proveedor', 'Monto', 'Caja', 'Fecha', 'Notas', 'Acciones'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {filtered.map(c => {
              const cfg = TIPO_CONFIG[c.tipo]
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: cfg.bg, color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--foreground)' }}>{c.concepto}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{c.proveedor ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold" style={{ color: '#dc2626' }}>{formatCOP(c.monto)}</td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{formatDate(c.fecha)}</td>
                  <td className="px-4 py-3 text-xs max-w-[160px] truncate" style={{ color: 'var(--muted-foreground)' }}>
                    {c.notas ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-blue-50">
                        <Pencil size={14} style={{ color: '#2563eb' }} />
                      </button>
                      <button onClick={() => handleDelete(c)} disabled={deleting === c.id}
                        className="p-1.5 rounded-lg hover:bg-red-50 disabled:opacity-40">
                        <Trash2 size={14} style={{ color: '#dc2626' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <ShoppingBag size={36} className="mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Sin registros</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-xl" style={{ background: '#fff' }}>
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
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
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
