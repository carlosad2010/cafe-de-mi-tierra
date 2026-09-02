'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Product, Presentation, TipoProducto } from '@/lib/types'
import { formatCOP, calcMargin, calcProfit } from '@/lib/utils'
import { Plus, Pencil, Package, TrendingUp } from 'lucide-react'
import { useEscKey } from '@/lib/hooks/useEscKey'
import { SearchField } from '@/components/ui/SearchField'
import { EmptyState } from '@/components/ui/EmptyState'
import { useCanWrite } from '@/lib/perfil-context'

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
  const canWrite = useCanWrite()
  const [products, setProducts] = useState(initialProducts)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEscKey(() => setShowModal(false))

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

  const q = search.trim().toLowerCase()
  const filtered = !q ? products : products.filter(p =>
    [p.name, p.presentation?.nombre, p.tipo?.nombre].some(v => v?.toLowerCase().includes(q))
  )

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">Productos</h1>
          <p className="page-subtitle">
            {q
              ? `${filtered.length} de ${products.length} productos`
              : `${products.length} productos registrados`}
          </p>
        </div>
        {canWrite && (
          <button onClick={openCreate} className="btn btn-primary">
            <Plus size={16} /> Nuevo producto
          </button>
        )}
      </div>

      {/* Search */}
      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Buscar por nombre, presentación o tipo…"
        className="mb-4 max-w-sm"
      />

      {/* Table */}
      <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
        <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="hidden sm:table-cell">Presentación</th>
              <th className="hidden sm:table-cell">Tipo</th>
              <th className="hidden sm:table-cell">Costo</th>
              <th>Precio 1</th>
              <th className="hidden sm:table-cell">Precio 2</th>
              <th className="hidden sm:table-cell">Margen</th>
              <th>Stock</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id}>
                <td className="font-medium" style={{ color: 'var(--foreground)' }}>{p.name}</td>
                <td className="hidden sm:table-cell">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: 'var(--secondary)', color: 'var(--primary)' }}>
                    {p.presentation?.nombre}
                  </span>
                </td>
                <td className="capitalize hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{p.tipo?.nombre}</td>
                <td className="hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{formatCOP(p.cost_price)}</td>
                <td className="font-medium" style={{ color: 'var(--foreground)' }}>{formatCOP(p.precio1)}</td>
                <td className="hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{formatCOP(p.precio2)}</td>
                <td className="hidden sm:table-cell">
                  <div className="flex items-center gap-1">
                    <TrendingUp size={13} style={{ color: '#16a34a' }} />
                    <span style={{ color: '#16a34a' }}>{calcMargin(p.precio1, p.cost_price).toFixed(0)}%</span>
                  </div>
                </td>
                <td>
                  <span style={{ color: p.stock <= p.min_stock ? '#dc2626' : 'var(--foreground)', fontWeight: p.stock <= p.min_stock ? 600 : 400 }}>
                    {p.stock}
                  </span>
                </td>
                <td>
                  <button onClick={() => toggleActive(p)}
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: p.active ? '#dcfce7' : '#fee2e2', color: p.active ? '#16a34a' : '#dc2626' }}>
                    {p.active ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td>
                  {canWrite && (
                    <button onClick={() => openEdit(p)} className="btn-icon">
                      <Pencil size={14} style={{ color: 'var(--muted-foreground)' }} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState
            icon={Package}
            title={q ? 'Sin resultados' : 'Aún no hay productos'}
            description={q
              ? `Ningún producto coincide con «${search}».`
              : 'Crea tu primer producto para poder registrar ventas.'}
            action={!q && (
              <button onClick={openCreate} className="btn btn-primary btn-sm">
                <Plus size={14} /> Nuevo producto
              </button>
            )}
          />
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
