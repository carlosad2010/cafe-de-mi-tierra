'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Product, InventoryMovement } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'
import { Plus, Warehouse, ArrowDownCircle, ArrowUpCircle, RefreshCcw } from 'lucide-react'

const MOVEMENT_TYPES = [
  { value: 'entrada', label: 'Entrada', icon: ArrowDownCircle, color: '#16a34a' },
  { value: 'salida', label: 'Salida', icon: ArrowUpCircle, color: '#dc2626' },
  { value: 'ajuste', label: 'Ajuste', icon: RefreshCcw, color: '#c4832a' },
]

export function InventoryClient({
  initialProducts,
  initialMovements,
}: {
  initialProducts: Product[]
  initialMovements: InventoryMovement[]
}) {
  const [products, setProducts] = useState(initialProducts)
  const [movements, setMovements] = useState(initialMovements)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ product_id: '', type: 'entrada', quantity: '', reason: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedProduct = products.find(p => p.id === form.product_id)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProduct) return
    setSaving(true)
    setError('')

    const supabase = createClient()
    const qty = Number(form.quantity)
    const prevStock = selectedProduct.stock

    let newStock = prevStock
    if (form.type === 'entrada') newStock = prevStock + qty
    else if (form.type === 'salida') newStock = prevStock - qty
    else newStock = qty

    if (newStock < 0) {
      setError('El stock no puede quedar negativo')
      setSaving(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()

    const { error: err } = await supabase.from('inventory_movements').insert({
      product_id: form.product_id,
      type: form.type,
      quantity: form.type === 'ajuste' ? qty - prevStock : qty,
      previous_stock: prevStock,
      new_stock: newStock,
      reason: form.reason || null,
      created_by: user?.id,
    })

    if (err) { setError(err.message); setSaving(false); return }

    await supabase.from('products').update({ stock: newStock }).eq('id', form.product_id)

    setProducts(prev => prev.map(p => p.id === form.product_id ? { ...p, stock: newStock } : p))

    const { data: newMovements } = await supabase
      .from('inventory_movements')
      .select('*, product:products(name, presentation:presentations(nombre), tipo:tipos_producto(nombre)), creator:profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(50)

    setMovements(newMovements ?? [])
    setShowModal(false)
    setSaving(false)
    setForm({ product_id: '', type: 'entrada', quantity: '', reason: '' })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Inventario</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Control de stock y movimientos</p>
        </div>
        <button onClick={() => { setForm({ product_id: '', type: 'entrada', quantity: '', reason: '' }); setError(''); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <Plus size={16} /> Registrar movimiento
        </button>
      </div>

      {/* Stock table */}
      <div className="rounded-xl border overflow-hidden mb-6" style={{ background: '#fff', borderColor: 'var(--border)' }}>
        <div className="px-5 py-4 border-b font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          Stock actual
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--secondary)' }}>
              {['Producto', 'Presentación', 'Tipo', 'Stock actual', 'Stock mínimo', 'Estado'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {products.map(p => {
              const low = p.stock <= p.min_stock
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--foreground)' }}>{p.name}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--secondary)', color: 'var(--primary)' }}>{p.presentation?.nombre}</span></td>
                  <td className="px-4 py-3 capitalize" style={{ color: 'var(--muted-foreground)' }}>{p.tipo?.nombre}</td>
                  <td className="px-4 py-3 font-bold" style={{ color: low ? '#dc2626' : '#16a34a' }}>{p.stock}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{p.min_stock}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: low ? '#fee2e2' : '#dcfce7', color: low ? '#dc2626' : '#16a34a' }}>
                      {low ? 'Stock bajo' : 'Normal'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Movements history */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#fff', borderColor: 'var(--border)' }}>
        <div className="px-5 py-4 border-b font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          Últimos movimientos
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--secondary)' }}>
              {['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Stock anterior', 'Stock nuevo', 'Razón'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {movements.map(m => {
              const mt = MOVEMENT_TYPES.find(t => t.value === m.type)
              return (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{formatDateTime(m.created_at)}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--foreground)' }}>
                    {(m as any).product?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                      style={{ background: mt?.color + '20', color: mt?.color }}>
                      {mt?.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: mt?.color }}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{m.previous_stock}</td>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--foreground)' }}>{m.new_stock}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{m.reason ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {movements.length === 0 && (
          <div className="py-12 text-center">
            <Warehouse size={36} className="mx-auto mb-2" style={{ color: 'var(--muted-foreground)' }} />
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Sin movimientos registrados</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-xl" style={{ background: '#fff' }}>
            <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--foreground)' }}>Registrar movimiento</h2>

            <form onSubmit={handleSave} className="space-y-4">
              <Field label="Producto *">
                <select required value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))} className="input-field">
                  <option value="">Seleccionar...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>)}
                </select>
              </Field>

              <Field label="Tipo de movimiento">
                <div className="grid grid-cols-3 gap-2">
                  {MOVEMENT_TYPES.map(t => (
                    <button key={t.value} type="button"
                      onClick={() => setForm(f => ({ ...f, type: t.value }))}
                      className="py-2 rounded-lg text-sm font-medium border transition-all"
                      style={{
                        borderColor: form.type === t.value ? t.color : 'var(--border)',
                        background: form.type === t.value ? t.color + '15' : 'transparent',
                        color: form.type === t.value ? t.color : 'var(--muted-foreground)',
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label={form.type === 'ajuste' ? 'Nuevo stock total' : 'Cantidad'}>
                <input type="number" required min="1" value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  className="input-field" placeholder="0" />
                {selectedProduct && (
                  <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    Stock actual: {selectedProduct.stock}
                    {form.quantity && form.type !== 'ajuste' && (
                      <> → Nuevo: {form.type === 'entrada' ? selectedProduct.stock + Number(form.quantity) : selectedProduct.stock - Number(form.quantity)}</>
                    )}
                  </p>
                )}
              </Field>

              <Field label="Razón (opcional)">
                <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  className="input-field" placeholder="Compra a proveedor, pérdida, etc." />
              </Field>

              {error && <p className="text-sm p-3 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{error}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                  {saving ? 'Guardando...' : 'Registrar'}
                </button>
              </div>
            </form>
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
