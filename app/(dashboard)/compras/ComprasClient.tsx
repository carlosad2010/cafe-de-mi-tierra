'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Caja, Compra } from '@/lib/types'
import { formatCOP, formatDate } from '@/lib/utils'
import { Plus, ShoppingBag, Pencil, Trash2, X, Banknote, Wallet } from 'lucide-react'

type CompraFull = Compra & {
  caja?: Pick<Caja, 'nombre' | 'tipo'>
  creator?: { full_name: string }
}

const EMPTY_FORM = {
  concepto: '',
  proveedor: '',
  monto: '',
  caja_id: '',
  fecha: new Date().toISOString().slice(0, 10),
  notas: '',
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

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, caja_id: cajas[0]?.id ?? '', fecha: new Date().toISOString().slice(0, 10) })
    setError('')
    setShowModal(true)
  }

  function openEdit(c: CompraFull) {
    setEditing(c)
    setForm({
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
      // Update compra (and update the linked movimiento)
      const updates = {
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
      // 1. Create movimiento egreso
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

      // 2. Create compra linked to movimiento
      const { data: compra, error: compraErr } = await supabase
        .from('compras')
        .insert({
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
    if (!confirm(`¿Eliminar compra "${c.concepto}"? También se eliminará el movimiento de caja.`)) return
    setDeleting(c.id)
    const supabase = createClient()
    await supabase.from('compras').delete().eq('id', c.id)
    if (c.movimiento_id) {
      await supabase.from('movimientos_caja').delete().eq('id', c.movimiento_id)
    }
    setCompras(prev => prev.filter(x => x.id !== c.id))
    setDeleting(null)
  }

  // Summary stats
  const totalEfectivo = compras
    .filter(c => c.caja?.tipo === 'efectivo')
    .reduce((s, c) => s + c.monto, 0)
  const totalBancaria = compras
    .filter(c => c.caja?.tipo === 'bancaria')
    .reduce((s, c) => s + c.monto, 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Compras</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{compras.length} registros</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <Plus size={16} /> Registrar Compra
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border p-4 flex items-center gap-4"
          style={{ background: '#fff', borderColor: 'var(--border)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#d1fae5' }}>
            <Banknote size={20} style={{ color: '#065f46' }} />
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Total gastos efectivo</p>
            <p className="text-lg font-bold" style={{ color: '#dc2626' }}>{formatCOP(totalEfectivo)}</p>
          </div>
        </div>
        <div className="rounded-2xl border p-4 flex items-center gap-4"
          style={{ background: '#fff', borderColor: 'var(--border)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#dbeafe' }}>
            <Wallet size={20} style={{ color: '#1e40af' }} />
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Total gastos bancaria</p>
            <p className="text-lg font-bold" style={{ color: '#dc2626' }}>{formatCOP(totalBancaria)}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#fff', borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--secondary)' }}>
              {['Concepto', 'Proveedor', 'Monto', 'Caja', 'Fecha', 'Notas', 'Acciones'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {compras.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
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
                <td className="px-4 py-3 text-xs max-w-[180px] truncate" style={{ color: 'var(--muted-foreground)' }}>
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
            ))}
          </tbody>
        </table>
        {compras.length === 0 && (
          <div className="py-16 text-center">
            <ShoppingBag size={36} className="mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Sin compras registradas</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-xl" style={{ background: '#fff' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
                {editing ? 'Editar compra' : 'Registrar compra'}
              </h2>
              <button onClick={() => setShowModal(false)}><X size={18} style={{ color: 'var(--muted-foreground)' }} /></button>
            </div>

            <div className="p-6 space-y-4">
              <Field label="Concepto *">
                <input type="text" value={form.concepto}
                  onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
                  placeholder="Ej: Compra de café verde" className="input-field" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Proveedor">
                  <input type="text" value={form.proveedor}
                    onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}
                    placeholder="Nombre proveedor" className="input-field" />
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
                    {cajas.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
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
