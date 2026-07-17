'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Order, Product, Customer, PaymentMethod } from '@/lib/types'
import { formatCOP, formatDateTime, ORDER_STATUS, PAYMENT_METHODS } from '@/lib/utils'
import { Plus, ShoppingCart, Pencil, Trash2, Check, X } from 'lucide-react'

type CartItem = { product: Product; quantity: number }

const EMPTY_ORDER = {
  customer_id: '', payment_method: 'efectivo' as PaymentMethod,
  notes: '', discount: '0', price_tier: 'precio1' as 'precio1' | 'precio2',
}

export function SalesClient({
  initialOrders, products, customers,
}: {
  initialOrders: Order[]
  products: Product[]
  customers: Customer[]
}) {
  const [orders, setOrders] = useState(initialOrders)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_ORDER)
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedProduct, setSelectedProduct] = useState('')
  const [selectedQty, setSelectedQty] = useState('1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('todos')

  const subtotal = cart.reduce((s, i) => s + i.product[form.price_tier] * i.quantity, 0)
  const discount = Number(form.discount) || 0
  const total = subtotal - discount

  function addToCart() {
    const prod = products.find(p => p.id === selectedProduct)
    if (!prod) return
    const qty = Number(selectedQty)
    if (qty <= 0) return
    setCart(prev => {
      const existing = prev.find(i => i.product.id === prod.id)
      if (existing) return prev.map(i => i.product.id === prod.id ? { ...i, quantity: i.quantity + qty } : i)
      return [...prev, { product: prod, quantity: qty }]
    })
    setSelectedProduct('')
    setSelectedQty('1')
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(i => i.product.id !== productId))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (cart.length === 0) { setError('Agrega al menos un producto'); return }
    if (total < 0) { setError('El descuento no puede superar el subtotal'); return }
    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        customer_id: form.customer_id || null,
        seller_id: user?.id,
        payment_method: form.payment_method,
        notes: form.notes || null,
        subtotal,
        discount,
        total,
        status: 'pendiente',
      })
      .select()
      .single()

    if (orderErr) { setError(orderErr.message); setSaving(false); return }

    const items = cart.map(i => ({
      order_id: order.id,
      product_id: i.product.id,
      product_name: i.product.name,
      product_presentation: i.product.presentation?.nombre ?? '',
      product_type: i.product.tipo?.nombre ?? '',
      quantity: i.quantity,
      unit_price: i.product[form.price_tier],
      cost_price: i.product.cost_price,
      subtotal: i.product[form.price_tier] * i.quantity,
    }))

    const { error: itemsErr } = await supabase.from('order_items').insert(items)
    if (itemsErr) { setError(itemsErr.message); setSaving(false); return }

    const { data: fullOrder } = await supabase
      .from('orders')
      .select('*, customer:customers(full_name, phone, email), seller:profiles(full_name), items:order_items(*, product:products(name))')
      .eq('id', order.id)
      .single()

    setOrders(prev => [fullOrder, ...prev])
    setShowModal(false)
    setCart([])
    setForm(EMPTY_ORDER)
    setSaving(false)
  }

  async function updateStatus(orderId: string, status: Order['status']) {
    const supabase = createClient()
    const { data } = await supabase
      .from('orders').update({ status }).eq('id', orderId)
      .select('*, customer:customers(full_name, phone, email), seller:profiles(full_name), items:order_items(*, product:products(name))')
      .single()

    if (data && status === 'completado') {
      // Find the active caja that matches the payment method
      const cajaTipo = data.payment_method === 'efectivo' ? 'efectivo' : 'bancaria'
      const { data: caja } = await supabase
        .from('cajas')
        .select('id')
        .eq('tipo', cajaTipo)
        .eq('activa', true)
        .limit(1)
        .maybeSingle()

      if (caja) {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('movimientos_caja').insert({
          caja_id: caja.id,
          tipo: 'ingreso',
          concepto: `Venta #${data.order_number}`,
          monto: data.total,
          referencia: data.payment_method !== 'efectivo' ? PAYMENT_METHODS[data.payment_method] : null,
          orden_id: data.id,
          created_by: user?.id ?? null,
        })
      }
    }

    if (data) setOrders(prev => prev.map(o => o.id === orderId ? data : o))
  }

  const filtered = filterStatus === 'todos' ? orders : orders.filter(o => o.status === filterStatus)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Ventas</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{orders.length} pedidos registrados</p>
        </div>
        <button onClick={() => { setForm(EMPTY_ORDER); setCart([]); setError(''); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <Plus size={16} /> Nuevo pedido
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {['todos', 'pendiente', 'completado', 'cancelado'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
            style={{
              background: filterStatus === s ? 'var(--primary)' : 'var(--secondary)',
              color: filterStatus === s ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            }}>
            {s === 'todos' ? 'Todos' : ORDER_STATUS[s]?.label}
          </button>
        ))}
      </div>

      {/* Orders table */}
      <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
        <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: '600px' }}>
          <thead>
            <tr style={{ background: 'var(--secondary)' }}>
              {['#', 'Cliente', 'Vendedor', 'Método de pago', 'Total', 'Estado', 'Fecha', 'Acciones'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {filtered.map(order => {
              const st = ORDER_STATUS[order.status]
              return (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium" style={{ color: 'var(--primary)' }}>#{order.order_number}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--foreground)' }}>{(order as any).customer?.full_name ?? 'Sin cliente'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{(order as any).seller?.full_name ?? '—'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{PAYMENT_METHODS[order.payment_method]}</td>
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--primary)' }}>{formatCOP(order.total)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st?.color}`}>{st?.label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{formatDateTime(order.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {order.status === 'pendiente' && (
                        <>
                          <button onClick={() => updateStatus(order.id, 'completado')}
                            className="p-1.5 rounded-lg hover:bg-green-50" title="Completar">
                            <Check size={14} style={{ color: '#16a34a' }} />
                          </button>
                          <button onClick={() => updateStatus(order.id, 'cancelado')}
                            className="p-1.5 rounded-lg hover:bg-red-50" title="Cancelar">
                            <X size={14} style={{ color: '#dc2626' }} />
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
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <ShoppingCart size={40} className="mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Sin pedidos</p>
          </div>
        )}
      </div>

      {/* New order modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-2xl rounded-2xl shadow-xl max-h-[95vh] overflow-y-auto" style={{ background: '#fff' }}>
            <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>Nuevo pedido</h2>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              {/* Client + payment */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Cliente (opcional)">
                  <select value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} className="input-field">
                    <option value="">Sin cliente</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </Field>
                <Field label="Método de pago *">
                  <select required value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value as PaymentMethod }))} className="input-field">
                    {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
              </div>

              {/* Price tier selector */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Tipo de precio</label>
                <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)', width: 'fit-content' }}>
                  {([
                    { key: 'precio1', label: 'Precio 1 — Distribuidor' },
                    { key: 'precio2', label: 'Precio 2 — Público' },
                  ] as const).map(opt => (
                    <button key={opt.key} type="button"
                      className="px-5 py-2 text-sm font-medium transition-colors"
                      style={form.price_tier === opt.key
                        ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                        : { background: '#fff', color: 'var(--muted-foreground)' }}
                      onClick={() => setForm(f => ({ ...f, price_tier: opt.key }))}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add product to cart */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--secondary)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Agregar productos</p>
                <div className="flex gap-2 items-center">
                  <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}
                    className="input-field"
                    style={{ flex: '1 1 0%', minWidth: 0 }}>
                    <option value="">Seleccionar producto...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} — {formatCOP(p[form.price_tier])} (Stock: {p.stock})</option>
                    ))}
                  </select>
                  <div className="flex flex-col items-center shrink-0">
                    <label className="text-xs mb-0.5" style={{ color: 'var(--muted-foreground)' }}>Cant.</label>
                    <input type="number" min="1" value={selectedQty} onChange={e => setSelectedQty(e.target.value)}
                      className="w-14 border rounded-lg px-1 py-2 text-center text-sm outline-none"
                      style={{ borderColor: 'var(--border)', background: '#fff' }} />
                  </div>
                  <button type="button" onClick={addToCart} disabled={!selectedProduct}
                    className="shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                    Agregar
                  </button>
                </div>
              </div>

              {/* Cart */}
              {cart.length > 0 && (
                <div className="rounded-xl border" style={{ borderColor: 'var(--border)', overflow: 'hidden' }}>
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: '400px' }}>
                    <thead>
                      <tr style={{ background: 'var(--secondary)' }}>
                        {['Producto', 'Precio unit.', 'Cant.', 'Subtotal', ''].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {cart.map(item => (
                        <tr key={item.product.id}>
                          <td className="px-3 py-2" style={{ color: 'var(--foreground)' }}>
                            {item.product.presentation?.nombre} {item.product.tipo?.nombre}
                          </td>
                          <td className="px-3 py-2" style={{ color: 'var(--muted-foreground)' }}>{formatCOP(item.product[form.price_tier])}</td>
                          <td className="px-3 py-2">
                            <input type="number" min="1" value={item.quantity}
                              onChange={e => setCart(prev => prev.map(i => i.product.id === item.product.id ? { ...i, quantity: Number(e.target.value) } : i))}
                              className="w-16 border rounded-md px-2 py-1 text-center text-sm outline-none"
                              style={{ borderColor: 'var(--border)' }} />
                          </td>
                          <td className="px-3 py-2 font-medium" style={{ color: 'var(--primary)' }}>
                            {formatCOP(item.product[form.price_tier] * item.quantity)}
                          </td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => removeFromCart(item.product.id)}>
                              <Trash2 size={14} style={{ color: '#dc2626' }} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--secondary)' }}>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--muted-foreground)' }}>Subtotal</span>
                  <span style={{ color: 'var(--foreground)' }}>{formatCOP(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--muted-foreground)' }}>Descuento</span>
                  <input type="number" min="0" max={subtotal} value={form.discount}
                    onChange={e => setForm(f => ({ ...f, discount: e.target.value }))}
                    className="w-32 border rounded-md px-2 py-1 text-right text-sm outline-none"
                    style={{ borderColor: 'var(--border)', background: '#fff' }} />
                </div>
                <div className="flex justify-between font-bold border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--foreground)' }}>Total</span>
                  <span style={{ color: 'var(--primary)' }}>{formatCOP(total)}</span>
                </div>
              </div>

              <Field label="Notas (opcional)">
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="input-field resize-none" rows={2} placeholder="Instrucciones especiales, preferencias de molido..." />
              </Field>

              {error && <p className="text-sm p-3 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{error}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setCart([]) }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving || cart.length === 0}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                  {saving ? 'Guardando...' : 'Crear pedido'}
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
