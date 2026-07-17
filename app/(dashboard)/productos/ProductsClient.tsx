'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Product, Presentation, TipoProducto } from '@/lib/types'
import { formatCOP, calcMargin, calcProfit } from '@/lib/utils'
import { Plus, Pencil, Package, TrendingUp } from 'lucide-react'

type ProductForm = {
  name: string; description: string; presentation_id: string
  tipo_id: string; cost_price: string; precio1: string; precio2: string
  stock: string; min_stock: string; sku: string; active: boolean
}

const EMPTY_FORM: ProductForm = {
  name: '', description: '', presentation_id: '', tipo_id: '',
  cost_price: '', precio1: '', precio2: '', stock: '', min_stock: '5', sku: '', active: true,
}

export function ProductsClient({ initialProducts, presentations, tiposProducto }: {
  initialProducts: Product[]
  presentations: Presentation[]
  tiposProducto: TipoProducto[]
}) {
  const [products, setProducts] = useState(initialProducts)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, presentation_id: presentations[0]?.id ?? '', tipo_id: tiposProducto[0]?.id ?? '' })
    setError('')
    setShowModal(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      name: p.name, description: p.description ?? '',
      presentation_id: p.presentation_id, tipo_id: p.tipo_id,
      cost_price: String(p.cost_price),
      precio1: String(p.precio1),
      precio2: String(p.precio2),
      stock: String(p.stock), min_stock: String(p.min_stock),
      sku: p.sku ?? '', active: p.active,
    })
    setError('')
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const supabase = createClient()

    const payload = {
      name: form.name,
      description: form.description || null,
      presentation_id: form.presentation_id,
      tipo_id: form.tipo_id,
      cost_price: Number(form.cost_price),
      precio1: Number(form.precio1),
      precio2: Number(form.precio2),
      stock: Number(form.stock),
      min_stock: Number(form.min_stock),
      sku: form.sku || null,
      active: form.active,
    }

    if (editing) {
      const { error: err } = await supabase
        .from('products').update(payload).eq('id', editing.id)
      if (err) { setError(err.message); setSaving(false); return }
      setProducts(prev => prev.map(p => p.id === editing.id ? { ...p, ...payload } : p))
    } else {
      const { data, error: err } = await supabase
        .from('products').insert(payload).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      setProducts(prev => [...prev, data])
    }

    setShowModal(false)
    setSaving(false)
  }

  async function toggleActive(p: Product) {
    const supabase = createClient()
    const { error } = await supabase
      .from('products').update({ active: !p.active }).eq('id', p.id)
    if (!error) setProducts(prev => prev.map(x => x.id === p.id ? { ...x, active: !x.active } : x))
  }

  const precio1V = Number(form.precio1)
  const precio2V = Number(form.precio2)
  const costP = Number(form.cost_price)
  const margin1 = calcMargin(precio1V, costP)
  const profit1 = calcProfit(precio1V, costP)
  const margin2 = calcMargin(precio2V, costP)
  const profit2 = calcProfit(precio2V, costP)

  return (
    <div className="p-4 sm:p-6">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Productos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{products.length} productos registrados</p>
        </div>
        <button onClick={openCreate} className="btn btn-primary">
          <Plus size={16} /> Nuevo producto
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
        <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: '600px' }}>
          <thead>
            <tr style={{ background: 'var(--secondary)' }}>
              {['Producto', 'Presentación', 'Tipo', 'Costo', 'Precio 1', 'Precio 2', 'Margen', 'Stock', 'Estado', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {products.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--foreground)' }}>{p.name}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: 'var(--secondary)', color: 'var(--primary)' }}>
                    {p.presentation?.nombre}
                  </span>
                </td>
                <td className="px-4 py-3 capitalize" style={{ color: 'var(--muted-foreground)' }}>{p.tipo?.nombre}</td>
                <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{formatCOP(p.cost_price)}</td>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--foreground)' }}>{formatCOP(p.precio1)}</td>
                <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{formatCOP(p.precio2)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <TrendingUp size={13} style={{ color: '#16a34a' }} />
                    <span style={{ color: '#16a34a' }}>{calcMargin(p.precio1, p.cost_price).toFixed(0)}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span style={{ color: p.stock <= p.min_stock ? '#dc2626' : 'var(--foreground)', fontWeight: p.stock <= p.min_stock ? 600 : 400 }}>
                    {p.stock}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(p)}
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: p.active ? '#dcfce7' : '#fee2e2', color: p.active ? '#16a34a' : '#dc2626' }}>
                    {p.active ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    <Pencil size={14} style={{ color: 'var(--muted-foreground)' }} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {products.length === 0 && (
          <div className="py-16 text-center">
            <Package size={40} className="mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Sin productos. Crea el primero.</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--foreground)' }}>
              {editing ? 'Editar producto' : 'Nuevo producto'}
            </h2>

            <form onSubmit={handleSave} className="space-y-4">
              <Field label="Nombre del producto">
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input-field" placeholder="Café de mi Tierra Premium" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Presentación">
                  <select value={form.presentation_id} onChange={e => setForm(f => ({ ...f, presentation_id: e.target.value }))} className="input-field">
                    {presentations.map(pr => <option key={pr.id} value={pr.id}>{pr.nombre}</option>)}
                  </select>
                </Field>
                <Field label="Tipo">
                  <select value={form.tipo_id} onChange={e => setForm(f => ({ ...f, tipo_id: e.target.value }))} className="input-field">
                    {tiposProducto.map(t => <option key={t.id} value={t.id}>{t.nombre.charAt(0).toUpperCase() + t.nombre.slice(1)}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Precio de costo (COP)">
                <input type="number" required min="0" value={form.cost_price}
                  onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} className="input-field" placeholder="0" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Precio 1 — Distribuidor (COP)">
                  <input type="number" required min="0" value={form.precio1}
                    onChange={e => setForm(f => ({ ...f, precio1: e.target.value }))} className="input-field" placeholder="0" />
                </Field>
                <Field label="Precio 2 — Público (COP)">
                  <input type="number" required min="0" value={form.precio2}
                    onChange={e => setForm(f => ({ ...f, precio2: e.target.value }))} className="input-field" placeholder="0" />
                </Field>
              </div>

              {costP > 0 && (precio1V > 0 || precio2V > 0) && (
                <div className="rounded-lg p-3 space-y-1 text-sm" style={{ background: 'var(--secondary)' }}>
                  {precio1V > 0 && (
                    <div className="flex gap-4">
                      <span style={{ color: 'var(--muted-foreground)' }}>P1 ganancia: <strong style={{ color: '#16a34a' }}>{formatCOP(profit1)}</strong></span>
                      <span style={{ color: 'var(--muted-foreground)' }}>Margen: <strong style={{ color: '#16a34a' }}>{margin1.toFixed(1)}%</strong></span>
                    </div>
                  )}
                  {precio2V > 0 && (
                    <div className="flex gap-4">
                      <span style={{ color: 'var(--muted-foreground)' }}>P2 ganancia: <strong style={{ color: '#16a34a' }}>{formatCOP(profit2)}</strong></span>
                      <span style={{ color: 'var(--muted-foreground)' }}>Margen: <strong style={{ color: '#16a34a' }}>{margin2.toFixed(1)}%</strong></span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Stock actual">
                  <input type="number" required min="0" value={form.stock}
                    onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} className="input-field" placeholder="0" />
                </Field>
                <Field label="Stock mínimo">
                  <input type="number" required min="0" value={form.min_stock}
                    onChange={e => setForm(f => ({ ...f, min_stock: e.target.value }))} className="input-field" placeholder="5" />
                </Field>
              </div>

              <Field label="SKU (opcional)">
                <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                  className="input-field" placeholder="CMT-G-250" />
              </Field>

              <Field label="Descripción (opcional)">
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="input-field resize-none" rows={2} />
              </Field>

              {error && <p className="text-sm p-3 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{error}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary flex-1">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
