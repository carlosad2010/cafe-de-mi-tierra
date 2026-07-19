'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Order, Product, Customer, MetodoPago } from '@/lib/types'
import { formatCOP, formatDateTime, ORDER_STATUS, PAYMENT_METHODS } from '@/lib/utils'
import { Plus, ShoppingCart, Pencil, Trash2, Check, X, Eye } from 'lucide-react'
import { useEscKey } from '@/lib/hooks/useEscKey'

// ── Types ────────────────────────────────────────────────────────────────────

type CartItem = { product: Product; quantity: number }

type FormState = {
  customer_id: string
  payment_method: string
  notes: string
  discount: string
  price_tier: 'precio1' | 'precio2'
}

// ── ActionBtn ────────────────────────────────────────────────────────────────
// Professional icon button: icon transitions from gray → colored on hover

type ActionVariant = 'success' | 'danger' | 'primary' | 'warning' | 'neutral'

const ACTION_VARIANTS: Record<ActionVariant, { idle: string; active: string; bg: string }> = {
  success: { idle: '#9ca3af', active: '#fff',     bg: '#16a34a' },
  danger:  { idle: '#9ca3af', active: '#fff',     bg: '#dc2626' },
  primary: { idle: '#9ca3af', active: '#fff',     bg: '#7c5c42' },
  warning: { idle: '#9ca3af', active: '#fff',     bg: '#D97706' },
  neutral: { idle: '#9ca3af', active: '#374151',  bg: '#e5e7eb' },
}

function ActionBtn({
  icon: Icon, label, onClick, variant = 'neutral', disabled = false,
}: {
  icon: React.ElementType; label: string; onClick: () => void
  variant?: ActionVariant; disabled?: boolean
}) {
  const [hov, setHov] = useState(false)
  const v = ACTION_VARIANTS[variant]
  const active = hov && !disabled
  return (
    <button
      onClick={onClick}
      title={label}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '2rem', height: '2rem', borderRadius: '0.5rem', border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        background: active ? v.bg : 'transparent',
        transform: active ? 'scale(1.12)' : 'scale(1)',
        transition: 'background 0.13s ease, transform 0.13s ease, box-shadow 0.13s ease',
        boxShadow: active ? `0 2px 8px ${v.bg}55` : 'none',
        opacity: disabled ? 0.4 : 1,
      }}>
      <Icon
        size={14}
        style={{ color: active ? v.active : v.idle, transition: 'color 0.13s ease' }}
      />
    </button>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyForm(defaultMetodo: string): FormState {
  return { customer_id: '', payment_method: defaultMetodo, notes: '', discount: '0', price_tier: 'precio1' }
}

function detectPriceTier(items: any[], products: Product[]): 'precio1' | 'precio2' {
  for (const item of items) {
    const p = products.find(pr => pr.id === item.product_id)
    if (!p) continue
    const diff1 = Math.abs(item.unit_price - p.precio1)
    const diff2 = Math.abs(item.unit_price - p.precio2)
    return diff2 < diff1 ? 'precio2' : 'precio1'
  }
  return 'precio1'
}

// ── Main component ────────────────────────────────────────────────────────────

export function SalesClient({
  initialOrders, products, customers, metodosPago,
}: {
  initialOrders: Order[]
  products: Product[]
  customers: Customer[]
  metodosPago: MetodoPago[]
}) {
  const defaultMetodo = metodosPago[0]?.nombre ?? 'Efectivo'

  // List state
  const [orders, setOrders]       = useState(initialOrders)
  const [filterStatus, setFilterStatus] = useState('todos')

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<FormState>(emptyForm(defaultMetodo))
  const [createCart, setCreateCart] = useState<CartItem[]>([])
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError]   = useState('')

  // Edit modal
  const [editOrder, setEditOrder]   = useState<Order | null>(null)
  const [editForm, setEditForm]     = useState<FormState>(emptyForm(defaultMetodo))
  const [editCart, setEditCart]     = useState<CartItem[]>([])
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError]   = useState('')

  // Detail view modal
  const [viewOrder, setViewOrder]   = useState<Order | null>(null)

  // Shared product-picker state (create)
  const [selProd, setSelProd]   = useState('')
  const [selQty, setSelQty]     = useState('1')

  // Shared product-picker state (edit)
  const [editSelProd, setEditSelProd] = useState('')
  const [editSelQty, setEditSelQty]   = useState('1')

  // ESC closes topmost open modal
  useEscKey(() => {
    if (viewOrder)    { setViewOrder(null); return }
    if (editOrder)    { setEditOrder(null); return }
    if (showCreate)   { setShowCreate(false); setCreateCart([]) }
  })

  // ── Cart helpers ────────────────────────────────────────────────────────────

  function addToCreateCart() {
    const prod = products.find(p => p.id === selProd)
    if (!prod) return
    const qty = Math.max(1, Number(selQty))
    setCreateCart(prev => {
      const ex = prev.find(i => i.product.id === prod.id)
      return ex
        ? prev.map(i => i.product.id === prod.id ? { ...i, quantity: i.quantity + qty } : i)
        : [...prev, { product: prod, quantity: qty }]
    })
    setSelProd(''); setSelQty('1')
  }

  function addToEditCart() {
    const prod = products.find(p => p.id === editSelProd)
    if (!prod) return
    const qty = Math.max(1, Number(editSelQty))
    setEditCart(prev => {
      const ex = prev.find(i => i.product.id === prod.id)
      return ex
        ? prev.map(i => i.product.id === prod.id ? { ...i, quantity: i.quantity + qty } : i)
        : [...prev, { product: prod, quantity: qty }]
    })
    setEditSelProd(''); setEditSelQty('1')
  }

  // ── Open edit ────────────────────────────────────────────────────────────────

  function openEdit(order: Order) {
    const existingItems: any[] = (order as any).items ?? []
    const tier = detectPriceTier(existingItems, products)
    const cart: CartItem[] = existingItems
      .map((item: any) => {
        const product = products.find(p => p.id === item.product_id)
        return product ? { product, quantity: item.quantity } : null
      })
      .filter((x: any): x is CartItem => x !== null)

    setEditOrder(order)
    setEditCart(cart)
    setEditForm({
      customer_id:    (order as any).customer_id ?? '',
      payment_method: order.payment_method,
      notes:          order.notes ?? '',
      discount:       String(order.discount ?? 0),
      price_tier:     tier,
    })
    setEditError('')
    setEditSelProd(''); setEditSelQty('1')
  }

  // ── Create handler ───────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (createCart.length === 0) { setCreateError('Agrega al menos un producto'); return }
    const subtotal = createCart.reduce((s, i) => s + i.product[createForm.price_tier] * i.quantity, 0)
    const discount = Number(createForm.discount) || 0
    const total    = subtotal - discount
    if (total < 0) { setCreateError('El descuento no puede superar el subtotal'); return }

    setCreateSaving(true); setCreateError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        customer_id:    createForm.customer_id || null,
        seller_id:      user?.id,
        payment_method: createForm.payment_method,
        notes:          createForm.notes || null,
        subtotal, discount, total,
        status: 'pendiente',
      })
      .select().single()

    if (orderErr) { setCreateError(orderErr.message); setCreateSaving(false); return }

    const items = createCart.map(i => ({
      order_id: order.id,
      product_id: i.product.id,
      product_name: i.product.name,
      product_presentation: i.product.presentation?.nombre ?? '',
      product_type: i.product.tipo?.nombre ?? '',
      quantity: i.quantity,
      unit_price: i.product[createForm.price_tier],
      cost_price: i.product.cost_price,
      subtotal: i.product[createForm.price_tier] * i.quantity,
    }))

    const { error: itemsErr } = await supabase.from('order_items').insert(items)
    if (itemsErr) { setCreateError(itemsErr.message); setCreateSaving(false); return }

    const { data: fullOrder } = await supabase
      .from('orders')
      .select('*, customer:customers(full_name, phone, email), seller:profiles(full_name), items:order_items(*, product:products(name))')
      .eq('id', order.id).single()

    setOrders(prev => [fullOrder, ...prev])
    setShowCreate(false)
    setCreateCart([])
    setCreateForm(emptyForm(defaultMetodo))
    setCreateSaving(false)
  }

  // ── Edit handler ─────────────────────────────────────────────────────────────

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editOrder) return
    if (editCart.length === 0) { setEditError('Agrega al menos un producto'); return }
    const subtotal = editCart.reduce((s, i) => s + i.product[editForm.price_tier] * i.quantity, 0)
    const discount = Number(editForm.discount) || 0
    const total    = subtotal - discount
    if (total < 0) { setEditError('El descuento no puede superar el subtotal'); return }

    setEditSaving(true); setEditError('')
    const supabase = createClient()

    const { error: orderErr } = await supabase
      .from('orders')
      .update({
        customer_id:    editForm.customer_id || null,
        payment_method: editForm.payment_method,
        notes:          editForm.notes || null,
        subtotal, discount, total,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editOrder.id)

    if (orderErr) { setEditError(orderErr.message); setEditSaving(false); return }

    await supabase.from('order_items').delete().eq('order_id', editOrder.id)

    const items = editCart.map(i => ({
      order_id: editOrder.id,
      product_id: i.product.id,
      product_name: i.product.name,
      product_presentation: i.product.presentation?.nombre ?? '',
      product_type: i.product.tipo?.nombre ?? '',
      quantity: i.quantity,
      unit_price: i.product[editForm.price_tier],
      cost_price: i.product.cost_price,
      subtotal: i.product[editForm.price_tier] * i.quantity,
    }))

    const { error: itemsErr } = await supabase.from('order_items').insert(items)
    if (itemsErr) { setEditError(itemsErr.message); setEditSaving(false); return }

    const { data: fullOrder } = await supabase
      .from('orders')
      .select('*, customer:customers(full_name, phone, email), seller:profiles(full_name), items:order_items(*, product:products(name))')
      .eq('id', editOrder.id).single()

    if (fullOrder) setOrders(prev => prev.map(o => o.id === editOrder.id ? fullOrder : o))
    setEditOrder(null)
    setEditSaving(false)
  }

  // ── Status update ─────────────────────────────────────────────────────────────

  async function updateStatus(orderId: string, status: Order['status']) {
    const supabase = createClient()
    const { data } = await supabase
      .from('orders').update({ status }).eq('id', orderId)
      .select('*, customer:customers(full_name, phone, email), seller:profiles(full_name), items:order_items(*, product:products(name))')
      .single()

    if (data && status === 'completado') {
      const matchedMetodo = metodosPago.find(m => m.nombre === data.payment_method)
      let cajaDest: string | null = null

      if (matchedMetodo) {
        const { data: cajaPorMetodo } = await supabase
          .from('cajas').select('id')
          .eq('activa', true).eq('metodo_pago_id', matchedMetodo.id)
          .limit(1).maybeSingle()
        cajaDest = cajaPorMetodo?.id ?? null
      }

      if (!cajaDest) {
        const cajaTipo = (matchedMetodo?.tipo === 'efectivo' || data.payment_method === 'efectivo' || data.payment_method === 'Efectivo')
          ? 'efectivo' : 'bancaria'
        const { data: cajaPorTipo } = await supabase
          .from('cajas').select('id')
          .eq('activa', true).eq('tipo', cajaTipo)
          .limit(1).maybeSingle()
        cajaDest = cajaPorTipo?.id ?? null
      }

      if (cajaDest) {
        const { data: { user } } = await supabase.auth.getUser()
        const isEfectivo = matchedMetodo?.tipo === 'efectivo' || data.payment_method === 'efectivo'
        await supabase.from('movimientos_caja').insert({
          caja_id: cajaDest,
          tipo: 'ingreso',
          concepto: `Venta #${data.order_number}`,
          monto: data.total,
          referencia: isEfectivo ? null : (PAYMENT_METHODS[data.payment_method] ?? data.payment_method),
          orden_id: data.id,
          created_by: user?.id ?? null,
        })
      }
    }

    if (data) setOrders(prev => prev.map(o => o.id === orderId ? data : o))
  }

  // ── Filtered list ─────────────────────────────────────────────────────────────

  const filtered = filterStatus === 'todos' ? orders : orders.filter(o => o.status === filterStatus)

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Ventas</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{orders.length} pedidos registrados</p>
        </div>
        <button
          onClick={() => { setCreateForm(emptyForm(defaultMetodo)); setCreateCart([]); setCreateError(''); setShowCreate(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <Plus size={16} /> Nuevo pedido
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
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
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--secondary)' }}>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>#</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Cliente</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>Vendedor</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>Método</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Total</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Estado</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>Fecha</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {filtered.map(order => {
                const st = ORDER_STATUS[order.status]
                const isPending = order.status === 'pendiente'
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium" style={{ color: 'var(--primary)' }}>#{order.order_number}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--foreground)' }}>{(order as any).customer?.full_name ?? 'Sin cliente'}</td>
                    <td className="px-4 py-3 hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{(order as any).seller?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>
                      {PAYMENT_METHODS[order.payment_method] ?? order.payment_method}
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: 'var(--primary)' }}>{formatCOP(order.total)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st?.color}`}>{st?.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{formatDateTime(order.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-0.5 items-center">
                        {/* Ver detalle */}
                        <ActionBtn
                          icon={Eye}
                          label="Ver detalle"
                          variant="neutral"
                          onClick={() => setViewOrder(order)}
                        />
                        {/* Solo para pendientes */}
                        {isPending && (
                          <>
                            <ActionBtn
                              icon={Pencil}
                              label="Editar pedido"
                              variant="primary"
                              onClick={() => openEdit(order)}
                            />
                            <ActionBtn
                              icon={Check}
                              label="Completar pedido"
                              variant="success"
                              onClick={() => updateStatus(order.id, 'completado')}
                            />
                            <ActionBtn
                              icon={X}
                              label="Cancelar pedido"
                              variant="danger"
                              onClick={() => updateStatus(order.id, 'cancelado')}
                            />
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

      {/* ── Modal: ver detalle ──────────────────────────────────────────────────── */}
      {viewOrder && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setViewOrder(null) }}>
          <div style={{ background: '#fff', borderRadius: '1.25rem', width: '100%', maxWidth: '32rem', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
            <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h2 className="font-bold text-base" style={{ color: 'var(--foreground)' }}>Pedido #{viewOrder.order_number}</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{formatDateTime(viewOrder.created_at)}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ORDER_STATUS[viewOrder.status]?.color}`}>
                {ORDER_STATUS[viewOrder.status]?.label}
              </span>
            </div>
            <div className="p-6 space-y-4">
              {(viewOrder as any).customer && (
                <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--secondary)' }}>
                  <p className="font-medium" style={{ color: 'var(--foreground)' }}>{(viewOrder as any).customer.full_name}</p>
                  {(viewOrder as any).customer.email && <p style={{ color: 'var(--muted-foreground)' }}>{(viewOrder as any).customer.email}</p>}
                  {(viewOrder as any).customer.phone && <p style={{ color: 'var(--muted-foreground)' }}>{(viewOrder as any).customer.phone}</p>}
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="pb-2 text-left font-medium text-xs" style={{ color: 'var(--muted-foreground)' }}>Producto</th>
                    <th className="pb-2 text-right font-medium text-xs" style={{ color: 'var(--muted-foreground)' }}>Precio</th>
                    <th className="pb-2 text-right font-medium text-xs" style={{ color: 'var(--muted-foreground)' }}>Cant.</th>
                    <th className="pb-2 text-right font-medium text-xs" style={{ color: 'var(--muted-foreground)' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {((viewOrder as any).items ?? []).map((item: any) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-2" style={{ color: 'var(--foreground)' }}>{item.product_presentation} {item.product_type}</td>
                      <td className="py-2 text-right" style={{ color: 'var(--muted-foreground)' }}>{formatCOP(item.unit_price)}</td>
                      <td className="py-2 text-right" style={{ color: 'var(--muted-foreground)' }}>{item.quantity}</td>
                      <td className="py-2 text-right font-medium" style={{ color: 'var(--primary)' }}>{formatCOP(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="space-y-1 pt-1">
                {viewOrder.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--muted-foreground)' }}>Descuento</span>
                    <span style={{ color: '#dc2626' }}>- {formatCOP(viewOrder.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold">
                  <span style={{ color: 'var(--foreground)' }}>Total</span>
                  <span style={{ color: 'var(--primary)' }}>{formatCOP(viewOrder.total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--muted-foreground)' }}>Método de pago</span>
                  <span style={{ color: 'var(--foreground)' }}>{PAYMENT_METHODS[viewOrder.payment_method] ?? viewOrder.payment_method}</span>
                </div>
                {viewOrder.notes && (
                  <div className="pt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                    <span className="font-medium" style={{ color: 'var(--foreground)' }}>Notas: </span>
                    {viewOrder.notes}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 pb-6">
              <button onClick={() => setViewOrder(null)} className="w-full py-2.5 rounded-lg text-sm font-medium border"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: nuevo pedido ─────────────────────────────────────────────────── */}
      {showCreate && (
        <OrderModal
          title="Nuevo pedido"
          form={createForm}
          setForm={setCreateForm}
          cart={createCart}
          setCart={setCreateCart}
          selProd={selProd} setSelProd={setSelProd}
          selQty={selQty} setSelQty={setSelQty}
          onAddToCart={addToCreateCart}
          saving={createSaving}
          error={createError}
          products={products}
          customers={customers}
          metodosPago={metodosPago}
          onSubmit={handleCreate}
          submitLabel="Crear pedido"
          onClose={() => { setShowCreate(false); setCreateCart([]) }}
        />
      )}

      {/* ── Modal: editar pedido ────────────────────────────────────────────────── */}
      {editOrder && (
        <OrderModal
          title={`Editar pedido #${editOrder.order_number}`}
          form={editForm}
          setForm={setEditForm}
          cart={editCart}
          setCart={setEditCart}
          selProd={editSelProd} setSelProd={setEditSelProd}
          selQty={editSelQty} setSelQty={setEditSelQty}
          onAddToCart={addToEditCart}
          saving={editSaving}
          error={editError}
          products={products}
          customers={customers}
          metodosPago={metodosPago}
          onSubmit={handleUpdate}
          submitLabel="Guardar cambios"
          onClose={() => setEditOrder(null)}
        />
      )}
    </div>
  )
}

// ── OrderModal ────────────────────────────────────────────────────────────────

function OrderModal({
  title, form, setForm, cart, setCart,
  selProd, setSelProd, selQty, setSelQty,
  onAddToCart, saving, error, products, customers, metodosPago,
  onSubmit, submitLabel, onClose,
}: {
  title: string
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>
  cart: CartItem[]; setCart: React.Dispatch<React.SetStateAction<CartItem[]>>
  selProd: string; setSelProd: (v: string) => void
  selQty: string; setSelQty: (v: string) => void
  onAddToCart: () => void
  saving: boolean; error: string
  products: Product[]; customers: Customer[]; metodosPago: MetodoPago[]
  onSubmit: (e: React.FormEvent) => void
  submitLabel: string; onClose: () => void
}) {
  const subtotal = cart.reduce((s, i) => s + i.product[form.price_tier] * i.quantity, 0)
  const discount = Number(form.discount) || 0
  const total    = subtotal - discount

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: '1.25rem', width: '100%', maxWidth: '42rem', maxHeight: '95vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} style={{ color: 'var(--muted-foreground)' }} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-5">
          {/* Cliente + método */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Cliente (opcional)">
              <select value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} className="input-field">
                <option value="">Sin cliente</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </Field>
            <Field label="Método de pago *">
              <select required value={form.payment_method}
                onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                className="input-field">
                {metodosPago.map(m => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
              </select>
            </Field>
          </div>

          {/* Tier de precio */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Tipo de precio</label>
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)', width: 'fit-content' }}>
              {(['precio1', 'precio2'] as const).map(key => (
                <button key={key} type="button"
                  className="px-5 py-2 text-sm font-medium transition-colors"
                  style={form.price_tier === key
                    ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                    : { background: '#fff', color: 'var(--muted-foreground)' }}
                  onClick={() => setForm(f => ({ ...f, price_tier: key }))}>
                  {key === 'precio1' ? 'Precio 1 — Distribuidor' : 'Precio 2 — Público'}
                </button>
              ))}
            </div>
          </div>

          {/* Agregar producto */}
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--secondary)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Agregar productos</p>
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-0">
                <select value={selProd} onChange={e => setSelProd(e.target.value)} className="input-field">
                  <option value="">Seleccionar producto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — {formatCOP(p[form.price_tier])} (Stock: {p.stock})</option>
                  ))}
                </select>
              </div>
              <div className="shrink-0">
                <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>Cant.</label>
                <input type="number" min="1" value={selQty} onChange={e => setSelQty(e.target.value)}
                  className="w-16 border rounded-lg px-2 py-2 text-center text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: '#fff' }} />
              </div>
              <button type="button" onClick={onAddToCart} disabled={!selProd}
                className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                Agregar
              </button>
            </div>
          </div>

          {/* Carrito */}
          {cart.length > 0 && (
            <div className="rounded-xl border" style={{ borderColor: 'var(--border)', overflow: 'hidden' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: '380px' }}>
                  <thead>
                    <tr style={{ background: 'var(--secondary)' }}>
                      {['Producto', 'Precio', 'Cant.', 'Subtotal', ''].map(h => (
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
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          {formatCOP(item.product[form.price_tier])}
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="1" value={item.quantity}
                            onChange={e => setCart(prev => prev.map(i =>
                              i.product.id === item.product.id ? { ...i, quantity: Math.max(1, Number(e.target.value)) } : i
                            ))}
                            className="w-16 border rounded-md px-2 py-1 text-center text-sm outline-none"
                            style={{ borderColor: 'var(--border)', background: '#fff' }} />
                        </td>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--primary)' }}>
                          {formatCOP(item.product[form.price_tier] * item.quantity)}
                        </td>
                        <td className="px-3 py-2">
                          <ActionBtn
                            icon={Trash2}
                            label="Quitar"
                            variant="danger"
                            onClick={() => setCart(prev => prev.filter(i => i.product.id !== item.product.id))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Totales */}
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
              className="input-field resize-none" rows={2}
              placeholder="Instrucciones especiales, preferencias de molido..." />
          </Field>

          {error && (
            <p className="text-sm p-3 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)', background: '#fff' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving || cart.length === 0}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              {saving ? 'Guardando...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>{label}</label>
      {children}
    </div>
  )
}
