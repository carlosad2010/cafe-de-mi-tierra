'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Order } from '@/lib/types'
import { formatCOP, formatDate, formatDateTime, getWhatsAppLink, PAYMENT_METHODS } from '@/lib/utils'
import { FileText, Send, MessageCircle, Eye, Download, RotateCcw, AlertTriangle, Package, Wallet, CheckCircle, ChevronDown, X } from 'lucide-react'
import { useEscKey } from '@/lib/hooks/useEscKey'

export function InvoicesClient({ orders: initialOrders }: { orders: Order[] }) {
  const [orders, setOrders]             = useState(initialOrders)
  const [sending, setSending]           = useState<string | null>(null)
  const [preview, setPreview]           = useState<Order | null>(null)
  const [confirmOrder, setConfirmOrder] = useState<Order | null>(null)
  const [reversando, setReversando]     = useState(false)
  const [successMsg, setSuccessMsg]     = useState('')
  const [filterCliente, setFilterCliente] = useState('')
  const [filterMetodo, setFilterMetodo]   = useState('')

  useEscKey(() => {
    if (confirmOrder && !reversando) { setConfirmOrder(null); return }
    if (preview) setPreview(null)
  })

  // ── Email ────────────────────────────────────────────────────
  async function sendEmail(order: Order) {
    const customer = (order as any).customer
    if (!customer?.email) { alert('Este cliente no tiene correo registrado'); return }
    setSending(order.id)
    try {
      const res = await fetch('/api/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      })
      if (res.ok) alert('Factura enviada por correo exitosamente')
      else alert('Error al enviar la factura')
    } catch { alert('Error de conexión') }
    setSending(null)
  }

  // ── WhatsApp ─────────────────────────────────────────────────
  function sendWhatsApp(order: Order) {
    const customer = (order as any).customer
    if (!customer?.phone) { alert('Este cliente no tiene teléfono registrado'); return }
    const items = ((order as any).items ?? [])
      .map((i: any) => `  • ${i.product_presentation} ${i.product_type} x${i.quantity} = ${formatCOP(i.subtotal)}`)
      .join('\n')
    const message = `🌿 *Café de mi Tierra*\n*Pedido #${order.order_number}*\nFecha: ${formatDate(order.created_at)}\n\n*Productos:*\n${items}\n\n${order.discount > 0 ? `Subtotal: ${formatCOP(order.subtotal)}\nDescuento: -${formatCOP(order.discount)}\n` : ''}*Total: ${formatCOP(order.total)}*\nPago: ${PAYMENT_METHODS[order.payment_method] ?? order.payment_method}\n\n¡Gracias por tu compra! ☕`
    window.open(getWhatsAppLink(customer.phone, message), '_blank')
  }

  // ── PDF ──────────────────────────────────────────────────────
  function printPDF(order: Order) {
    const customer = (order as any).customer
    const items: any[] = (order as any).items ?? []
    const itemsHTML = items.map((item: any) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #f5e8d8;color:#2c1810;">${item.product_name}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f5e8d8;text-align:right;color:#6b4423;">${formatCOP(item.unit_price)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f5e8d8;text-align:right;color:#6b4423;">${item.quantity}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f5e8d8;text-align:right;font-weight:600;color:#2c1810;">${formatCOP(item.subtotal)}</td>
      </tr>`).join('')
    const customerHTML = customer ? `
      <div style="background:#fdf8f3;border-radius:12px;padding:16px;margin-bottom:24px;">
        <p style="font-size:11px;font-weight:600;color:#6b4423;margin:0 0 8px;">CLIENTE</p>
        <p style="font-weight:500;color:#2c1810;margin:0 0 4px;">${customer.full_name}</p>
        ${customer.document_type && customer.document_number ? `<p style="font-size:13px;color:#6b4423;margin:2px 0;">${customer.document_type}: ${customer.document_number}</p>` : ''}
        ${customer.email ? `<p style="font-size:13px;color:#6b4423;margin:2px 0;">${customer.email}</p>` : ''}
        ${customer.phone ? `<p style="font-size:13px;color:#6b4423;margin:2px 0;">${customer.phone}</p>` : ''}
        ${customer.city ? `<p style="font-size:13px;color:#6b4423;margin:2px 0;">${customer.address ? customer.address + ', ' : ''}${customer.city}</p>` : ''}
      </div>` : ''
    const discountHTML = order.discount > 0 ? `
      <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px;">
        <span style="color:#6b4423;">Subtotal</span><span style="color:#2c1810;">${formatCOP(order.subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px;">
        <span style="color:#6b4423;">Descuento</span><span style="color:#dc2626;">- ${formatCOP(order.discount)}</span>
      </div>` : ''
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Pedido #${order.order_number} — Café de mi Tierra</title>
      <style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family: Arial, sans-serif; padding: 40px; max-width: 560px; margin: 0 auto; color: #2c1810; } @media print { body { padding: 20px; } }</style>
      </head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
        <div><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><div style="width:32px;height:32px;background:#8b5e3c;border-radius:8px;display:flex;align-items:center;justify-content:center;"><span style="color:#fff;font-size:13px;font-weight:bold;">C</span></div><span style="font-size:18px;font-weight:bold;color:#8b5e3c;">Café de mi Tierra</span></div><p style="font-size:12px;color:#6b4423;">Colombia · Café de especialidad</p></div>
        <div style="text-align:right;"><p style="font-size:20px;font-weight:bold;color:#8b5e3c;">PEDIDO #${order.order_number}</p><p style="font-size:12px;color:#6b4423;margin-top:4px;">Fecha: ${formatDate(order.created_at)}</p><span style="font-size:11px;background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:999px;font-weight:500;">Completado</span></div>
      </div>
      ${customerHTML}
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;"><thead><tr style="border-bottom:2px solid #e8ccab;"><th style="padding:8px;text-align:left;color:#6b4423;font-weight:600;">Producto</th><th style="padding:8px;text-align:right;color:#6b4423;font-weight:600;">Precio</th><th style="padding:8px;text-align:right;color:#6b4423;font-weight:600;">Cant.</th><th style="padding:8px;text-align:right;color:#6b4423;font-weight:600;">Subtotal</th></tr></thead><tbody>${itemsHTML}</tbody></table>
      <div style="border-top:1px solid #e8ccab;padding-top:16px;">${discountHTML}<div style="display:flex;justify-content:space-between;font-weight:bold;font-size:16px;padding-top:4px;margin-bottom:8px;"><span style="color:#2c1810;">Total</span><span style="color:#8b5e3c;">${formatCOP(order.total)}</span></div><div style="display:flex;justify-content:space-between;font-size:14px;"><span style="color:#6b4423;">Método de pago</span><span style="color:#2c1810;">${PAYMENT_METHODS[order.payment_method] ?? order.payment_method}</span></div></div>
      <p style="text-align:center;font-size:12px;color:#6b4423;margin-top:32px;">¡Gracias por tu compra! · Café de mi Tierra · Colombia</p>
      </body></html>`
    const w = window.open('', '_blank', 'width=640,height=860')
    if (!w) { alert('Permite las ventanas emergentes para imprimir'); return }
    w.document.write(html); w.document.close(); w.focus()
    setTimeout(() => w.print(), 400)
  }

  // ── Reversión ────────────────────────────────────────────────
  async function handleReverse() {
    if (!confirmOrder) return
    setReversando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase.rpc('reversar_factura', {
      p_order_id: confirmOrder.id,
      p_user_id:  user?.id ?? null,
    })

    if (error || data?.error) {
      alert(`Error al reversar: ${error?.message ?? data?.error}`)
      setReversando(false)
      return
    }

    // Remove from list (it's no longer 'completado')
    setOrders(prev => prev.filter(o => o.id !== confirmOrder.id))
    setConfirmOrder(null)
    setReversando(false)
    setSuccessMsg(`Venta #${confirmOrder.order_number} reversada. Stock restaurado y caja ajustada.`)
    setTimeout(() => setSuccessMsg(''), 5000)
  }

  // ── Filtros ──────────────────────────────────────────────────
  const uniqueMethods = Array.from(new Set(
    orders.map(o => PAYMENT_METHODS[o.payment_method] ?? o.payment_method)
  )).sort()

  const filtered = orders.filter(o => {
    const name = (o as any).customer?.full_name?.toLowerCase() ?? ''
    const method = PAYMENT_METHODS[o.payment_method] ?? o.payment_method
    const matchCliente = !filterCliente || name.includes(filterCliente.toLowerCase())
    const matchMetodo  = !filterMetodo  || method === filterMetodo
    return matchCliente && matchMetodo
  })

  const hasFilter = filterCliente || filterMetodo

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Facturas</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            Pedidos completados ·{' '}
            {hasFilter
              ? <><span style={{ color: 'var(--primary)', fontWeight: 600 }}>{filtered.length}</span> de {orders.length} facturas</>
              : <>{orders.length} facturas</>
            }
          </p>
        </div>
        {hasFilter && (
          <button
            onClick={() => { setFilterCliente(''); setFilterMetodo('') }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-gray-50"
            style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            <X size={12} /> Limpiar filtros
          </button>
        )}
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl text-sm font-medium"
          style={{ background: '#DCFCE7', color: '#166534' }}>
          <CheckCircle size={16} />
          {successMsg}
        </div>
      )}

      <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--secondary)', borderBottom: '1px solid var(--border)' }}>
                {/* # */}
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>#</th>

                {/* Cliente — con búsqueda */}
                <th className="px-4 py-2 text-left" style={{ minWidth: '180px' }}>
                  <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Cliente</div>
                  <div className="relative">
                    <input
                      type="text"
                      value={filterCliente}
                      onChange={e => setFilterCliente(e.target.value)}
                      placeholder="Buscar cliente..."
                      className="w-full text-xs rounded-md px-2.5 py-1.5 pr-7 outline-none"
                      style={{
                        border: `1px solid ${filterCliente ? 'var(--primary)' : 'var(--border)'}`,
                        background: filterCliente ? '#fdf8f3' : '#fff',
                        color: 'var(--foreground)',
                      }}
                    />
                    {filterCliente
                      ? <button onClick={() => setFilterCliente('')} className="absolute right-1.5 top-1/2 -translate-y-1/2">
                          <X size={11} style={{ color: 'var(--muted-foreground)' }} />
                        </button>
                      : <span className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="6" r="5" stroke="#9ca3af" strokeWidth="1.5"/><path d="M10 10l4 4" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </span>
                    }
                  </div>
                </th>

                {/* Fecha */}
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell" style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>Fecha</th>

                {/* Total */}
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>Total</th>

                {/* Método — con selector */}
                <th className="px-4 py-2 text-left hidden sm:table-cell" style={{ minWidth: '150px' }}>
                  <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Método</div>
                  <div className="relative">
                    <select
                      value={filterMetodo}
                      onChange={e => setFilterMetodo(e.target.value)}
                      className="w-full appearance-none text-xs rounded-md px-2.5 py-1.5 pr-7 outline-none"
                      style={{
                        border: `1px solid ${filterMetodo ? 'var(--primary)' : 'var(--border)'}`,
                        background: filterMetodo ? '#fdf8f3' : '#fff',
                        color: filterMetodo ? 'var(--foreground)' : 'var(--muted-foreground)',
                        cursor: 'pointer',
                      }}>
                      <option value="">Todos los métodos</option>
                      {uniqueMethods.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ChevronDown size={11} style={{ color: '#9ca3af' }} />
                    </span>
                    {filterMetodo && (
                      <button
                        onClick={() => setFilterMetodo('')}
                        className="absolute right-6 top-1/2 -translate-y-1/2">
                        <X size={11} style={{ color: 'var(--muted-foreground)' }} />
                      </button>
                    )}
                  </div>
                </th>

                {/* Email */}
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell" style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>Email</th>

                {/* Acciones */}
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {filtered.map(order => {
                const customer = (order as any).customer
                return (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium" style={{ color: 'var(--primary)' }}>#{order.order_number}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--foreground)' }}>
                      <div>{customer?.full_name ?? 'Sin cliente'}</div>
                      {customer?.email && <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{customer.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{formatDateTime(order.created_at)}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: 'var(--primary)' }}>{formatCOP(order.total)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>
                      {PAYMENT_METHODS[order.payment_method] ?? order.payment_method}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {order.email_sent
                        ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#16a34a' }}>Enviado</span>
                        : <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        <button onClick={() => setPreview(order)} title="Ver factura"
                          className="p-1.5 rounded-lg hover:bg-gray-100">
                          <Eye size={14} style={{ color: 'var(--muted-foreground)' }} />
                        </button>
                        <button onClick={() => printPDF(order)} title="Imprimir / PDF"
                          className="p-1.5 rounded-lg hover:bg-gray-100">
                          <Download size={14} style={{ color: 'var(--muted-foreground)' }} />
                        </button>
                        {customer?.email && (
                          <button onClick={() => sendEmail(order)} title="Enviar por correo"
                            disabled={sending === order.id}
                            className="p-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-40">
                            <Send size={14} style={{ color: '#2563eb' }} />
                          </button>
                        )}
                        {customer?.phone && (
                          <button onClick={() => sendWhatsApp(order)} title="Enviar por WhatsApp"
                            className="p-1.5 rounded-lg hover:bg-green-50">
                            <MessageCircle size={14} style={{ color: '#16a34a' }} />
                          </button>
                        )}
                        {/* Reversar */}
                        <button
                          onClick={() => setConfirmOrder(order)}
                          title="Reversar factura"
                          className="p-1.5 rounded-lg hover:bg-orange-50 transition-colors">
                          <RotateCcw size={14} style={{ color: '#D97706' }} />
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
            <FileText size={40} className="mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {hasFilter ? 'Sin resultados para los filtros aplicados.' : 'Sin facturas aún. Completa un pedido primero.'}
            </p>
            {hasFilter && (
              <button onClick={() => { setFilterCliente(''); setFilterMetodo('') }}
                className="mt-2 text-xs underline" style={{ color: 'var(--primary)' }}>
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: ver factura ─────────────────────────────────── */}
      {preview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setPreview(null) }}>
          <div className="w-full max-w-lg rounded-2xl shadow-xl bg-white max-h-[95vh] overflow-y-auto">
            <InvoicePreview order={preview} />
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setPreview(null)} className="btn btn-secondary flex-1">Cerrar</button>
              <button onClick={() => printPDF(preview)} className="btn btn-primary flex-1">Imprimir / PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: confirmar reversión ─────────────────────────── */}
      {confirmOrder && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget && !reversando) setConfirmOrder(null) }}>
          <div style={{ background: '#fff', borderRadius: '1.25rem', padding: '1.5rem', width: '100%', maxWidth: '28rem', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: '#FEF3C7' }}>
                <AlertTriangle size={20} style={{ color: '#D97706' }} />
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
                  Reversar factura #{confirmOrder.order_number}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  {(confirmOrder as any).customer?.full_name ?? 'Sin cliente'} · {formatCOP(confirmOrder.total)}
                </p>
              </div>
            </div>

            {/* Efectos */}
            <div className="rounded-xl p-4 mb-5 space-y-3" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#92400E' }}>
                Esta acción realizará los siguientes ajustes:
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center mt-0.5 shrink-0"
                    style={{ background: '#E0F2FE' }}>
                    <FileText size={13} style={{ color: '#0369A1' }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Pedido → Pendiente</p>
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      El pedido vuelve a estado Pendiente y puede re-completarse.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center mt-0.5 shrink-0"
                    style={{ background: '#DCFCE7' }}>
                    <Package size={13} style={{ color: '#166534' }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Inventario restaurado</p>
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {((confirmOrder as any).items ?? []).length} producto(s) regresan al stock con movimiento de entrada.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center mt-0.5 shrink-0"
                    style={{ background: '#FEE2E2' }}>
                    <Wallet size={13} style={{ color: '#DC2626' }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Caja ajustada</p>
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      Se crea un egreso de {formatCOP(confirmOrder.total)} en la caja correspondiente.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs mb-5 px-1" style={{ color: '#92400E' }}>
              Esta operación es reversible: puedes volver a completar el pedido desde el módulo de Ventas.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOrder(null)}
                disabled={reversando}
                className="btn btn-secondary flex-1">
                Cancelar
              </button>
              <button
                onClick={handleReverse}
                disabled={reversando}
                className="btn flex-1 disabled:opacity-60"
                style={{ background: '#D97706', color: '#fff', boxShadow: '0 2px 8px rgba(217,119,6,0.30)' }}>
                {reversando ? 'Reversando...' : 'Confirmar reversión'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Invoice preview ────────────────────────────────────────────
function InvoicePreview({ order }: { order: Order }) {
  const customer = (order as any).customer
  const items = (order as any).items ?? []

  return (
    <div className="p-8">
      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#8b5e3c' }}>
              <span className="text-white text-xs font-bold">C</span>
            </div>
            <span className="font-bold text-lg" style={{ color: '#8b5e3c' }}>Café de mi Tierra</span>
          </div>
          <p className="text-xs" style={{ color: '#6b4423' }}>Colombia · Café de especialidad</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-xl" style={{ color: '#8b5e3c' }}>PEDIDO #{order.order_number}</p>
          <p className="text-xs mt-1" style={{ color: '#6b4423' }}>Fecha: {formatDate(order.created_at)}</p>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#dcfce7', color: '#16a34a' }}>Completado</span>
        </div>
      </div>

      {customer && (
        <div className="rounded-xl p-4 mb-6" style={{ background: '#fdf8f3' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: '#6b4423' }}>CLIENTE</p>
          <p className="font-medium" style={{ color: '#2c1810' }}>{customer.full_name}</p>
          {customer.document_type && customer.document_number && (
            <p className="text-sm" style={{ color: '#6b4423' }}>{customer.document_type}: {customer.document_number}</p>
          )}
          {customer.email && <p className="text-sm" style={{ color: '#6b4423' }}>{customer.email}</p>}
          {customer.phone && <p className="text-sm" style={{ color: '#6b4423' }}>{customer.phone}</p>}
          {customer.city && <p className="text-sm" style={{ color: '#6b4423' }}>{customer.address ? `${customer.address}, ` : ''}{customer.city}</p>}
        </div>
      )}

      <table className="w-full text-sm mb-6">
        <thead>
          <tr style={{ borderBottom: '2px solid #e8ccab' }}>
            <th className="py-2 text-left font-semibold" style={{ color: '#6b4423' }}>Producto</th>
            <th className="py-2 text-right font-semibold" style={{ color: '#6b4423' }}>Precio</th>
            <th className="py-2 text-right font-semibold" style={{ color: '#6b4423' }}>Cant.</th>
            <th className="py-2 text-right font-semibold" style={{ color: '#6b4423' }}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => (
            <tr key={item.id} style={{ borderBottom: '1px solid #f5e8d8' }}>
              <td className="py-2.5" style={{ color: '#2c1810' }}>{item.product_name}</td>
              <td className="py-2.5 text-right" style={{ color: '#6b4423' }}>{formatCOP(item.unit_price)}</td>
              <td className="py-2.5 text-right" style={{ color: '#6b4423' }}>{item.quantity}</td>
              <td className="py-2.5 text-right font-medium" style={{ color: '#2c1810' }}>{formatCOP(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t pt-4 space-y-1.5" style={{ borderColor: '#e8ccab' }}>
        {order.discount > 0 && (
          <>
            <div className="flex justify-between text-sm">
              <span style={{ color: '#6b4423' }}>Subtotal</span>
              <span style={{ color: '#2c1810' }}>{formatCOP(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: '#6b4423' }}>Descuento</span>
              <span style={{ color: '#dc2626' }}>- {formatCOP(order.discount)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between font-bold text-base pt-1">
          <span style={{ color: '#2c1810' }}>Total</span>
          <span style={{ color: '#8b5e3c' }}>{formatCOP(order.total)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: '#6b4423' }}>Método de pago</span>
          <span style={{ color: '#2c1810' }}>{PAYMENT_METHODS[order.payment_method] ?? order.payment_method}</span>
        </div>
      </div>

      <p className="text-center text-xs mt-8" style={{ color: '#6b4423' }}>
        ¡Gracias por tu compra! · Café de mi Tierra · Colombia
      </p>
    </div>
  )
}
