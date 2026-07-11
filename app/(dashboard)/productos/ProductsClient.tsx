'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Product } from '@/lib/types'
import { formatCOP, calcMargin, calcProfit } from '@/lib/utils'
import { Plus, Pencil, Package, TrendingUp } from 'lucide-react'

const PRESENTATIONS = ['45g', '250g', '500g'] as const
const TYPES = ['grano', 'molido'] as const

type ProductForm = {
  name: string; description: string; presentation: import('@/lib/types').Presentation
  type: import('@/lib/types').CoffeeType; cost_price: string; sale_price: string
  stock: string; min_stock: string; sku: string; active: boolean
}

const EMPTY_FORM: ProductForm = {
  name: '', description: '', presentation: '45g', type: 'grano',
  cost_price: '', sale_price: '', stock: '', min_stock: '5', sku: '', active: true,
}

export function ProductsClient({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState(initialProducts)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      name: p.name, description: p.description ?? '',
      presentation: p.presentation, type: p.type,
      cost_price: String(p.cost_price), sale_price: String(p.sale_price),
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
      presentation: form.presentation,
      type: form.type,
      cost_price: Number(form.cost_price),
      sale_price: Number(form.sale_price),
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

  const saleP = Number(form.sale_price)
  const costP = Number(form.cost_price)
  const margin = calcMargin(saleP, costP)
  const profit = calcProfit(saleP, costP)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Productos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{products.length} productos registrados</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <Plus size={16} /> Nuevo producto
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#fff', borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--secondary)' }}>
              {['Producto', 'Presentación', 'Tipo', 'Costo', 'Precio', 'Margen', 'Stock', 'Estado', ''].map(h => (
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
                    {p.presentation}
                  </span>
                </td>
                <td className="px-4 py-3 capitalize" style={{ color: 'var(--muted-foreground)' }}>{p.type}</td>
                <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{formatCOP(p.cost_price)}</td>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--foreground)' }}>{formatCOP(p.sale_price)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <TrendingUp size={13} style={{ color: '#16a34a' }} />
                    <span style={{ color: '#16a34a' }}>{calcMargin(p.sale_price, p.cost_price).toFixed(0)}%</span>
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
        {products.length === 0 && (
          <div className="py-16 text-center">
            <Package size={40} className="mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Sin productos. Crea el primero.</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto" style={{ background: '#fff' }}>
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
                  <select value={form.presentation} onChange={e => setForm(f => ({ ...f, presentation: e.target.value as any }))} className="input-field">
                    {PRESENTATIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Tipo">
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))} className="input-field">
                    {TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Precio de costo (COP)">
                  <input type="number" required min="0" value={form.cost_price}
                    onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} className="input-field" placeholder="0" />
                </Field>
                <Field label="Precio de venta (COP)">
                  <input type="number" required min="0" value={form.sale_price}
                    onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} className="input-field" placeholder="0" />
                </Field>
              </div>

              {saleP > 0 && costP > 0 && (
                <div className="rounded-lg p-3 flex gap-4 text-sm" style={{ background: 'var(--secondary)' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Ganancia: <strong style={{ color: '#16a34a' }}>{formatCOP(profit)}</strong></span>
                  <span style={{ color: 'var(--muted-foreground)' }}>Margen: <strong style={{ color: '#16a34a' }}>{margin.toFixed(1)}%</strong></span>
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
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                  {saving ? 'Guardando...' : 'Guardar'}
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
