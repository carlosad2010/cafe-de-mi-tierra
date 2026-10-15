'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Order, Configuracion } from '@/lib/types'
import { formatCOP, formatDate, formatDateLarga, formatDateTime, getWhatsAppLink, montoEnLetras, PAYMENT_METHODS, CUENTA_PAGO, escapeHtml } from '@/lib/utils'
import { FileText, Send, MessageCircle, Eye, Download, RotateCcw, AlertTriangle, Package, Wallet, CheckCircle, ChevronDown, X, Receipt } from 'lucide-react'
import { useEscKey } from '@/lib/hooks/useEscKey'
import { useCanWrite } from '@/lib/perfil-context'
import { Pagination } from '@/components/ui/Pagination'

export function InvoicesClient({
  orders: initialOrders, page, pageSize, total, query, metodo, metodos, fromDate, toDate,
}: {
  orders: Order[]
  page: number
  pageSize: number
  total: number
  query: string
  metodo: string
  metodos: string[]
  fromDate?: string
  toDate?: string
}) {
  const canWrite                        = useCanWrite()
  const router                          = useRouter()
  const pathname                        = usePathname()
  const [navigating, startNavigation]   = useTransition()

  // El servidor entrega la pagina ya filtrada; el estado local solo absorbe
  // la reversion de una factura.
  const [orders, setOrders]             = useState(initialOrders)
  const [seed, setSeed]                 = useState(initialOrders)
  if (seed !== initialOrders) {
    setSeed(initialOrders)
    setOrders(initialOrders)
  }
  // Sin uso mientras el botón de "Enviar por correo" esté pausado (ver
  // sendEmail más abajo) — se deja listo para cuando se reactive.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [sending, setSending]           = useState<string | null>(null)
  const [preview, setPreview]           = useState<Order | null>(null)
  const [confirmOrder, setConfirmOrder] = useState<Order | null>(null)
  const [reversando, setReversando]     = useState(false)
  const [successMsg, setSuccessMsg]     = useState('')

  // ── Cuenta de cobro ─────────────────────────────────────────
  const [config, setConfig]               = useState<Configuracion | null>(null)
  const [ccOrder, setCcOrder]             = useState<Order | null>(null)
  const [emitiendoCC, setEmitiendoCC]     = useState(false)
  const [ccError, setCcError]             = useState('')

  useEffect(() => {
    createClient().from('configuracion').select('*').maybeSingle()
      .then(({ data }) => setConfig(data))
  }, [])
  // Texto del buscador: local para no perder el foco entre navegaciones
  const [search, setSearch]             = useState(query)

  // Date filters
  const [localFromDate, setLocalFromDate] = useState(fromDate || '')
  const [localToDate, setLocalToDate] = useState(toDate || '')

  /** Reescribe la URL con los filtros activos; el servidor devuelve la pagina. */
  function navigate(next: { q?: string; metodo?: string; page?: number; fromDate?: string; toDate?: string }) {
    const params   = new URLSearchParams()
    const nextQ    = (next.q ?? query).trim()
    const nextMet  = next.metodo ?? metodo
    const nextPage = next.page ?? 1
    const nextFrom = next.fromDate ?? localFromDate
    const nextTo   = next.toDate ?? localToDate
    if (nextQ)        params.set('q', nextQ)
    if (nextMet)      params.set('metodo', nextMet)
    if (nextPage > 1) params.set('page', String(nextPage))
    if (nextFrom)     params.set('fromDate', nextFrom)
    if (nextTo)       params.set('toDate', nextTo)
    const qs = params.toString()
    startNavigation(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  // Busqueda con retardo: evita una consulta por cada tecla
  useEffect(() => {
    if (search.trim() === query) return
    const timer = setTimeout(() => navigate({ q: search, page: 1 }), 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  useEscKey(() => {
    if (confirmOrder && !reversando) { setConfirmOrder(null); return }
    if (preview) setPreview(null)
  })

  // ── Email ────────────────────────────────────────────────────
  // Botón deshabilitado más abajo mientras no haya dominio verificado en
  // Resend (ver app/api/send-invoice/route.ts) — la función queda intacta,
  // lista para reactivar sin tener que reescribirla.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // ── Cuenta de cobro ──────────────────────────────────────────
  // El envío por correo está en pausa (ver app/api/send-invoice/route.ts):
  // en su lugar, emitir crea/reutiliza el registro congelado y el PDF se
  // descarga directo vía GET /api/cuenta-cobro/[id]/pdf — nunca se manda.
  async function emitirCuentaCobro() {
    if (!ccOrder) return
    setEmitiendoCC(true)
    setCcError('')
    try {
      const res = await fetch('/api/cuenta-cobro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: ccOrder.id }),
      })
      const data = await res.json()
      if (!res.ok) { setCcError(data.error ?? 'Error al emitir la cuenta de cobro'); setEmitiendoCC(false); return }

      // Refleja en la lista que ya quedó emitida, sin recargar la página.
      setOrders(prev => prev.map(o => o.id === ccOrder.id ? { ...o, cuenta_cobro: data.cuentaCobro } : o))
      setSuccessMsg(`Cuenta de cobro N.° ${data.cuentaCobro.numero} ${data.reutilizada ? '' : 'emitida y '}descargada`)
      setTimeout(() => setSuccessMsg(''), 4000)
      setCcOrder(null)

      // Descarga nativa del navegador: una navegación real a la ruta GET
      // (no fetch+blob) para que no haya que lidiar con memoria ni parsear
      // el header de Content-Disposition a mano.
      const a = document.createElement('a')
      a.href = `/api/cuenta-cobro/${data.cuentaCobro.id}/pdf`
      a.click()
    } catch {
      setCcError('Error de conexión')
    }
    setEmitiendoCC(false)
  }

  // ── WhatsApp ─────────────────────────────────────────────────
  function sendWhatsApp(order: Order) {
    const customer = (order as any).customer
    if (!customer?.phone) { alert('Este cliente no tiene teléfono registrado'); return }
    const items = ((order as any).items ?? [])
      .map((i: any) => `  • ${i.product_presentation} ${i.product_type} x${i.quantity} = ${formatCOP(i.subtotal)}`)
      .join('\n')
    const message = `🌿 *Café de mi Tierra*\n*Pedido #${order.order_number}*\nFecha: ${formatDate(order.created_at)}\n\n*Productos:*\n${items}\n\n${order.discount > 0 ? `Subtotal: ${formatCOP(order.subtotal)}\nDescuento: -${formatCOP(order.discount)}\n` : ''}*Total: ${formatCOP(order.total)}*\nPago: ${PAYMENT_METHODS[order.payment_method] ?? order.payment_method}\n\n💳 *Pagos por transferencia:*\n${CUENTA_PAGO.banco} ${CUENTA_PAGO.tipo}\nNo. ${CUENTA_PAGO.numero}\n\n¡Gracias por tu compra! ☕`
    window.open(getWhatsAppLink(customer.phone, message), '_blank')
  }

  // ── PDF ──────────────────────────────────────────────────────
  function printPDF(order: Order) {
    const customer = (order as any).customer
    const items: any[] = (order as any).items ?? []
    // Nombres de cliente y de producto son texto libre creado por el propio
    // equipo de ventas: se escapan antes de interpolarlos porque esta
    // ventana se abre en el mismo origen que el resto de la app.
    const itemsHTML = items.map((item: any) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #f5e8d8;color:#2c1810;">${escapeHtml(item.product_name)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f5e8d8;text-align:right;color:#6b4423;">${formatCOP(item.unit_price)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f5e8d8;text-align:right;color:#6b4423;">${item.quantity}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f5e8d8;text-align:right;font-weight:600;color:#2c1810;">${formatCOP(item.subtotal)}</td>
      </tr>`).join('')
    const customerHTML = customer ? `
      <div style="background:#fdf8f3;border-radius:12px;padding:16px;margin-bottom:24px;">
        <p style="font-size:11px;font-weight:600;color:#6b4423;margin:0 0 8px;">CLIENTE</p>
        <p style="font-weight:500;color:#2c1810;margin:0 0 4px;">${escapeHtml(customer.full_name)}</p>
        ${customer.document_type && customer.document_number ? `<p style="font-size:13px;color:#6b4423;margin:2px 0;">${escapeHtml(customer.document_type)}: ${escapeHtml(customer.document_number)}</p>` : ''}
        ${customer.email ? `<p style="font-size:13px;color:#6b4423;margin:2px 0;">${escapeHtml(customer.email)}</p>` : ''}
        ${customer.phone ? `<p style="font-size:13px;color:#6b4423;margin:2px 0;">${escapeHtml(customer.phone)}</p>` : ''}
        ${customer.city ? `<p style="font-size:13px;color:#6b4423;margin:2px 0;">${customer.address ? escapeHtml(customer.address) + ', ' : ''}${escapeHtml(customer.city)}</p>` : ''}
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
      <div style="background:#fdf8f3;border:1px solid #e8ccab;border-radius:12px;padding:14px 16px;margin-top:24px;text-align:center;">
        <p style="font-size:11px;font-weight:600;color:#6b4423;margin:0 0 4px;letter-spacing:0.03em;">PAGOS POR TRANSFERENCIA</p>
        <p style="font-size:14px;font-weight:600;color:#2c1810;margin:0;">${CUENTA_PAGO.banco} · ${CUENTA_PAGO.tipo} · No. ${CUENTA_PAGO.numero}</p>
      </div>
      <p style="text-align:center;font-size:12px;color:#6b4423;margin-top:16px;">¡Gracias por tu compra! · Café de mi Tierra · Colombia</p>
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

  const hasFilter = !!query || !!metodo

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">Facturas</h1>
          <p className="page-subtitle">
            Pedidos completados ·{' '}
            {hasFilter
              ? <><span style={{ color: 'var(--primary)', fontWeight: 600 }}>{total}</span> factura(s) con este filtro</>
              : <>{total} facturas</>
            }
          </p>
        </div>
        {hasFilter && (
          <button
            onClick={() => { setSearch(''); navigate({ q: '', metodo: '', page: 1 }) }}
            className="btn btn-secondary btn-sm">
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

      <div className="rounded-xl border" style={{
        background: '#fff', borderColor: 'var(--border)', overflow: 'hidden',
        opacity: navigating ? 0.6 : 1, transition: 'opacity 0.15s ease',
      }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr style={{ background: 'var(--secondary)', borderBottom: '1px solid var(--border)' }}>
                {/* # */}
                <th style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>#</th>

                {/* Cliente — con búsqueda */}
                <th style={{ minWidth: '180px' }}>
                  <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Cliente</div>
                  <div className="relative">
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar cliente..."
                      className="w-full text-xs rounded-md px-2.5 py-1.5 pr-7 outline-none"
                      style={{
                        border: `1px solid ${search ? 'var(--primary)' : 'var(--border)'}`,
                        background: search ? '#fdf8f3' : '#fff',
                        color: 'var(--foreground)',
                      }}
                    />
                    {search
                      ? <button onClick={() => { setSearch(''); navigate({ q: '', page: 1 }) }} className="absolute right-1.5 top-1/2 -translate-y-1/2">
                          <X size={11} style={{ color: 'var(--muted-foreground)' }} />
                        </button>
                      : <span className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="6" r="5" stroke="#9ca3af" strokeWidth="1.5"/><path d="M10 10l4 4" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </span>
                    }
        
          </div>
                </th>

                {/* Fecha */}
                <th className="hidden sm:table-cell" style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>Fecha</th>

                {/* Total */}
                <th style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>Total</th>

                {/* Método — con selector */}
                <th className="hidden sm:table-cell" style={{ minWidth: '150px' }}>
                  <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Método</div>
                  <div className="relative">
                    <select
                      value={metodo}
                      onChange={e => navigate({ metodo: e.target.value, page: 1 })}
                      className="w-full appearance-none text-xs rounded-md px-2.5 py-1.5 pr-7 outline-none"
                      style={{
                        border: `1px solid ${metodo ? 'var(--primary)' : 'var(--border)'}`,
                        background: metodo ? '#fdf8f3' : '#fff',
                        color: metodo ? 'var(--foreground)' : 'var(--muted-foreground)',
                        cursor: 'pointer',
                      }}>
                      <option value="">Todos los métodos</option>
                      {metodos.map(m => (
                        <option key={m} value={m}>{PAYMENT_METHODS[m] ?? m}</option>
                      ))}
                    </select>
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ChevronDown size={11} style={{ color: '#9ca3af' }} />
                    </span>
                    {metodo && (
                      <button
                        onClick={() => navigate({ metodo: '', page: 1 })}
                        className="absolute right-6 top-1/2 -translate-y-1/2">
                        <X size={11} style={{ color: 'var(--muted-foreground)' }} />
                      </button>
                    )}
                  </div>
                </th>

                {/* Fecha range */}
                <th className="hidden lg:table-cell" style={{ minWidth: '200px' }}>
                  <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Rango de fechas</div>
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={localFromDate}
                      max={localToDate || undefined}
                      onChange={e => {
                        setLocalFromDate(e.target.value)
                        navigate({ fromDate: e.target.value, toDate: localToDate, page: 1 })
                      }}
                      className="text-xs rounded-md px-2.5 py-1.5 outline-none flex-1"
                      style={{
                        border: `1px solid ${localFromDate ? 'var(--primary)' : 'var(--border)'}`,
                        background: localFromDate ? '#fdf8f3' : '#fff',
                        color: 'var(--foreground)',
                      }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>a</span>
                    <input
                      type="date"
                      value={localToDate}
                      min={localFromDate || undefined}
                      onChange={e => {
                        setLocalToDate(e.target.value)
                        navigate({ fromDate: localFromDate, toDate: e.target.value, page: 1 })
                      }}
                      className="text-xs rounded-md px-2.5 py-1.5 outline-none flex-1"
                      style={{
                        border: `1px solid ${localToDate ? 'var(--primary)' : 'var(--border)'}`,
                        background: localToDate ? '#fdf8f3' : '#fff',
                        color: 'var(--foreground)',
                      }}
                    />
                  </div>
                </th>

                {/* Email */}
                <th className="hidden sm:table-cell" style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>Email</th>

                {/* Acciones */}
                <th style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const customer = (order as any).customer
                return (
                  <tr key={order.id}>
                    <td className="font-mono font-medium" style={{ color: 'var(--primary)' }}>#{order.order_number}</td>
                    <td style={{ color: 'var(--foreground)' }}>
                      <div>{customer?.full_name ?? 'Sin cliente'}</div>
                      {customer?.email && <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{customer.email}</div>}
                    </td>
                    <td className="text-xs hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{formatDateTime(order.created_at)}</td>
                    <td className="font-semibold" style={{ color: 'var(--primary)' }}>{formatCOP(order.total)}</td>
                    <td className="hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>
                      {PAYMENT_METHODS[order.payment_method] ?? order.payment_method}
                    </td>
                    <td className="hidden sm:table-cell">
                      {order.email_sent
                        ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#16a34a' }}>Enviado</span>
                        : <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>—</span>}
                    </td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        <button onClick={() => setPreview(order)} title="Ver factura"
                          className="btn-icon">
                          <Eye size={14} style={{ color: 'var(--muted-foreground)' }} />
                        </button>
                        <button onClick={() => printPDF(order)} title="Imprimir / PDF"
                          className="btn-icon">
                          <Download size={14} style={{ color: 'var(--muted-foreground)' }} />
                        </button>
                        {/* Envío por correo en pausa: el remitente de Resend
                            todavía no tiene dominio propio verificado y no
                            entrega a clientes reales (ver /api/send-invoice).
                            Se deja visible pero deshabilitado, no oculto,
                            para que quede claro que es algo pendiente de
                            activar y no un botón que desapareció solo. */}
                        {customer?.email && canWrite && (
                          <button disabled title="Envío por correo en pausa: falta verificar un dominio propio en Resend"
                            className="p-1.5 rounded-lg opacity-30 cursor-not-allowed">
                            <Send size={14} style={{ color: '#2563eb' }} />
                          </button>
                        )}
                        {customer?.phone && (
                          <button onClick={() => sendWhatsApp(order)} title="Enviar por WhatsApp"
                            className="p-1.5 rounded-lg hover:bg-green-50">
                            <MessageCircle size={14} style={{ color: '#16a34a' }} />
                          </button>
                        )}
                        {/* Cuenta de cobro: solo clientes institucionales (NIT).
                            Emite (consume número) → del lado de escritura.
                            No requiere correo: se descarga, no se envía. */}
                        {customer?.document_type === 'NIT' && canWrite && (
                          <button onClick={() => { setCcError(''); setCcOrder(order) }}
                            title={order.cuenta_cobro
                              ? `Descargar cuenta de cobro N.° ${order.cuenta_cobro.numero}`
                              : 'Generar cuenta de cobro'}
                            className="p-1.5 rounded-lg hover:bg-amber-50">
                            <Receipt size={14} style={{ color: order.cuenta_cobro ? '#16a34a' : '#B45309' }} />
                          </button>
                        )}
                        {/* Reversar */}
                        {canWrite && (
                          <button
                            onClick={() => setConfirmOrder(order)}
                            title="Reversar factura"
                            className="p-1.5 rounded-lg hover:bg-orange-50 transition-colors">
                            <RotateCcw size={14} style={{ color: '#D97706' }} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {orders.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon"><FileText size={26} /></div>
            <p className="empty-state-title">{hasFilter ? 'Sin resultados' : 'Aún no hay facturas'}</p>
            <p className="empty-state-description">
              {hasFilter ? 'Ninguna factura coincide con los filtros aplicados.' : 'Completa un pedido para generar la primera factura.'}
            </p>
            {hasFilter && (
              <button onClick={() => { setSearch(''); navigate({ q: '', metodo: '', page: 1 }) }}
                className="mt-2 text-xs underline" style={{ color: 'var(--primary)' }}>
                Limpiar filtros
              </button>
            )}
          </div>
        )}
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          busy={navigating}
          onPageChange={p => navigate({ page: p })}
        />
      </div>

      {/* ── Modal: ver factura ─────────────────────────────────── */}
      {preview && (
        <div className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setPreview(null) }}>
          <div className="modal-box modal-box-flush">
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
        <div className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget && !reversando) setConfirmOrder(null) }}>
          <div className="modal-box" style={{ maxWidth: '28rem' }}>
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
              Esta operación es reversible: puedes volver a completar el pedido desde el módulo de Pedidos.
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

      {/* ── Modal: cuenta de cobro ─────────────────────────────── */}
      {ccOrder && (() => {
        const yaEmitida = ccOrder.cuenta_cobro
        const customer = (ccOrder as any).customer
        const items: any[] = (ccOrder as any).items ?? []
        const configListo = !!(config?.ciudad && config?.representante_legal_nombre && config?.representante_legal_documento)
        const puedeConfirmar = yaEmitida || configListo

        const datos = yaEmitida ? {
          numero: yaEmitida.numero,
          fecha: yaEmitida.fecha_emision,
          ciudad: yaEmitida.ciudad_emision,
          clienteNombre: yaEmitida.cliente_nombre,
          clienteNit: yaEmitida.cliente_nit,
          repNombre: yaEmitida.representante_nombre,
          repDocumento: yaEmitida.representante_documento,
          repFirmaUrl: yaEmitida.representante_firma_url,
          objeto: yaEmitida.objeto,
          items: yaEmitida.items,
          monto: yaEmitida.monto,
        } : {
          numero: null,
          fecha: new Date().toISOString(),
          ciudad: config?.ciudad ?? '—',
          clienteNombre: customer?.full_name ?? '',
          clienteNit: customer?.document_number ?? '',
          repNombre: config?.representante_legal_nombre ?? '—',
          repDocumento: config?.representante_legal_documento ?? '—',
          repFirmaUrl: config?.representante_legal_firma_url ?? null,
          objeto: Array.from(new Set(items.map(i => i.product_name))).join(', '),
          items: items.map(i => ({ product_name: i.product_name, quantity: i.quantity, unit_price: i.unit_price, subtotal: i.subtotal })),
          monto: ccOrder.total,
        }

        return (
          <div className="modal-overlay"
            onClick={e => { if (e.target === e.currentTarget && !emitiendoCC) setCcOrder(null) }}>
            <div className="modal-box modal-box-flush">
              <CuentaCobroPreview {...datos} />
              <div className="px-6 pb-6">
                {!configListo && !yaEmitida && (
                  <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: '#FFFBEB', color: '#92400E' }}>
                    Falta completar Ciudad y Representante legal en Configuración › Negocio antes de poder emitir.
                  </p>
                )}
                {ccError && (
                  <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{ccError}</p>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setCcOrder(null)} disabled={emitiendoCC} className="btn btn-secondary flex-1">
                    Cancelar
                  </button>
                  <button
                    onClick={emitirCuentaCobro}
                    disabled={emitiendoCC || !puedeConfirmar}
                    className="btn btn-primary flex-1 disabled:opacity-60">
                    {emitiendoCC ? 'Generando...' : yaEmitida ? 'Descargar de nuevo' : 'Confirmar y descargar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Cuenta de cobro preview ──────────────────────────────────────
// Vista en pantalla, independiente del PDF real (lib/pdf/cuentaCobro.tsx),
// igual que InvoicePreview/printPDF son dos representaciones separadas de
// la misma factura. Solo para mostrar al usuario antes de confirmar.
function CuentaCobroPreview({ numero, fecha, ciudad, clienteNombre, clienteNit, repNombre, repDocumento, repFirmaUrl, objeto, items, monto }: {
  numero: number | null
  fecha: string
  ciudad: string
  clienteNombre: string
  clienteNit: string
  repNombre: string
  repDocumento: string
  repFirmaUrl: string | null
  objeto: string
  items: { product_name: string; quantity: number; unit_price: number; subtotal: number }[]
  monto: number
}) {
  return (
    <div className="p-8">
      <p className="text-xs mb-1" style={{ color: '#6b4423' }}>{ciudad}, {formatDateLarga(fecha)}</p>
      <h2 className="text-center font-bold text-lg mb-6" style={{ color: '#8b5e3c' }}>
        CUENTA DE COBRO N.° {numero != null ? String(numero).padStart(3, '0') : '(se asigna al enviar)'}
      </h2>

      <div className="text-center mb-5">
        <p className="font-bold" style={{ color: '#2c1810' }}>{clienteNombre}</p>
        <p className="text-sm" style={{ color: '#6b4423' }}>NIT {clienteNit}</p>
        <p className="text-xs uppercase tracking-wide mt-2 mb-1" style={{ color: '#6b4423' }}>Debe a</p>
        <p className="font-bold" style={{ color: '#2c1810' }}>{repNombre}</p>
        <p className="text-sm" style={{ color: '#6b4423' }}>C.C. {repDocumento}</p>
      </div>

      <p className="text-sm mb-1" style={{ color: '#2c1810' }}>
        La suma de: <strong>{montoEnLetras(monto)}</strong> ({formatCOP(monto)})
      </p>
      <p className="text-sm mb-5" style={{ color: '#2c1810' }}>Objeto: {objeto}</p>

      <table className="w-full text-sm mb-5">
        <thead>
          <tr style={{ background: '#8b5e3c' }}>
            <th className="py-2 px-2 text-left font-semibold text-white text-xs">Ítem</th>
            <th className="py-2 px-2 text-center font-semibold text-white text-xs">Cant.</th>
            <th className="py-2 px-2 text-right font-semibold text-white text-xs">Valor unitario</th>
            <th className="py-2 px-2 text-right font-semibold text-white text-xs">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f5e8d8' }}>
              <td className="py-2 px-2" style={{ color: '#2c1810' }}>{item.product_name}</td>
              <td className="py-2 px-2 text-center" style={{ color: '#6b4423' }}>{item.quantity}</td>
              <td className="py-2 px-2 text-right" style={{ color: '#6b4423' }}>{formatCOP(item.unit_price)}</td>
              <td className="py-2 px-2 text-right font-medium" style={{ color: '#2c1810' }}>{formatCOP(item.subtotal)}</td>
            </tr>
          ))}
          <tr style={{ background: '#fdf8f3' }}>
            <td colSpan={3} className="py-2 px-2 text-right font-bold" style={{ color: '#2c1810' }}>Total</td>
            <td className="py-2 px-2 text-right font-bold" style={{ color: '#8b5e3c' }}>{formatCOP(monto)}</td>
          </tr>
        </tbody>
      </table>

      <p className="text-xs text-center rounded-xl p-3 mb-6" style={{ background: '#fdf8f3', border: '1px solid #e8ccab', color: '#6b4423' }}>
        Si el pago es por transferencia, consignar en la Cuenta de {CUENTA_PAGO.tipo} No. {CUENTA_PAGO.numero} de {CUENTA_PAGO.banco}, de la cual soy titular.
      </p>

      <div>
        {repFirmaUrl
          ? /* eslint-disable-next-line @next/next/no-img-element -- firma subida por el usuario */
            <img src={repFirmaUrl} alt="Firma" style={{ height: 50, marginBottom: 4 }} />
          : <div style={{ borderTop: '1px solid #999', width: 180, marginBottom: 4 }} />}
        <p className="font-bold text-sm" style={{ color: '#2c1810' }}>{repNombre}</p>
        <p className="text-xs" style={{ color: '#6b4423' }}>C.C. {repDocumento}</p>
      </div>
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
