'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Caja, CuentaCobrar, CuentaCobrarItem, Customer, EstadoCuenta, MetodoPago, Product,
} from '@/lib/types'
import { formatCOP, formatDate, formatDateTime } from '@/lib/utils'
import {
  Plus, HandCoins, Eye, Undo2, Receipt, Ban, X, Trash2,
  Package, Clock, AlertTriangle, CheckCircle2, Loader2,
} from 'lucide-react'
import { useEscKey } from '@/lib/hooks/useEscKey'

type CartItem = { product: Product; quantity: number }
type PriceTier = 'precio1' | 'precio2'

const ESTADO_CONFIG: Record<EstadoCuenta, { label: string; color: string; bg: string }> = {
  pendiente: { label: 'Pendiente', color: '#92400e', bg: '#fef3c7' },
  pagada:    { label: 'Facturada', color: '#065f46', bg: '#d1fae5' },
  anulada:   { label: 'Anulada',   color: '#6b7280', bg: '#f3f4f6' },
}

/** Unidades que siguen en poder del cliente y por tanto se cobran. */
function vigente(i: CuentaCobrarItem) {
  return i.cantidad_entregada - i.cantidad_devuelta
}

function diasDesde(fecha: string) {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000)
}

export function CuentasCobrarClient({
  cuentas, customers, products, cajas, metodosPago,
}: {
  cuentas: CuentaCobrar[]
  customers: Customer[]
  products: Product[]
  cajas: Pick<Caja, 'id' | 'nombre' | 'tipo'>[]
  metodosPago: MetodoPago[]
}) {
  const router = useRouter()

  const [filtro, setFiltro] = useState<'todas' | EstadoCuenta>('pendiente')

  // Crear
  const [showCreate, setShowCreate]   = useState(false)
  const [customerId, setCustomerId]   = useState('')
  const [tier, setTier]               = useState<PriceTier>('precio1')
  const [cart, setCart]               = useState<CartItem[]>([])
  const [descuento, setDescuento]     = useState('0')
  const [notas, setNotas]             = useState('')
  const [selProd, setSelProd]         = useState('')
  const [selQty, setSelQty]           = useState('1')

  // Modales sobre una cuenta existente
  const [verCuenta, setVerCuenta]         = useState<CuentaCobrar | null>(null)
  const [devolCuenta, setDevolCuenta]     = useState<CuentaCobrar | null>(null)
  const [devolQty, setDevolQty]           = useState<Record<string, string>>({})
  const [facturarCuenta, setFacturar]     = useState<CuentaCobrar | null>(null)
  const [metodoPago, setMetodoPago]       = useState('')
  const [cajaId, setCajaId]               = useState('')

  const [error, setError]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [okMsg, setOkMsg]     = useState('')

  // Candado síncrono: setState es asíncrono y dos clics en el mismo tick
  // lo atraviesan antes del re-render que deshabilita el botón. Sin esto
  // se generarían dos facturas y dos ingresos de caja.
  const busyRef = useRef(false)

  useEscKey(() => {
    if (busy) return
    if (facturarCuenta) { setFacturar(null); return }
    if (devolCuenta)    { setDevolCuenta(null); return }
    if (verCuenta)      { setVerCuenta(null); return }
    if (showCreate)     { setShowCreate(false) }
  })

  // ── Helpers ─────────────────────────────────────────────────────────────────

  async function runRpc(fn: string, args: Record<string, unknown>, exito: string) {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: rpcErr } = await supabase.rpc(fn, { ...args, p_user_id: user?.id ?? null })

    busyRef.current = false
    setBusy(false)

    if (rpcErr || data?.error) {
      setError(rpcErr?.message ?? data.error)
      return false
    }

    setOkMsg(exito)
    setTimeout(() => setOkMsg(''), 5000)
    router.refresh()
    return true
  }

  // ── Crear ───────────────────────────────────────────────────────────────────

  function addToCart() {
    const prod = products.find(p => p.id === selProd)
    if (!prod) return
    const qty = Math.max(1, Number(selQty) || 1)
    setCart(prev => {
      const ex = prev.find(i => i.product.id === prod.id)
      return ex
        ? prev.map(i => i.product.id === prod.id ? { ...i, quantity: i.quantity + qty } : i)
        : [...prev, { product: prod, quantity: qty }]
    })
    setSelProd(''); setSelQty('1')
  }

  const subtotalCart = cart.reduce((s, i) => s + i.product[tier] * i.quantity, 0)
  const totalCart    = subtotalCart - (Number(descuento) || 0)

  function resetCreate() {
    setCustomerId(''); setCart([]); setDescuento('0'); setNotas('')
    setSelProd(''); setSelQty('1'); setTier('precio1'); setError('')
  }

  async function handleCreate() {
    if (!customerId)      { setError('Selecciona el cliente que recibe la mercancía'); return }
    if (cart.length === 0) { setError('Agrega al menos un producto'); return }
    if (totalCart < 0)     { setError('El descuento no puede superar el subtotal'); return }

    const ok = await runRpc('crear_cuenta_cobrar', {
      p_customer_id: customerId,
      p_items: cart.map(i => ({
        product_id: i.product.id,
        quantity:   i.quantity,
        unit_price: i.product[tier],
      })),
      p_discount: Number(descuento) || 0,
      p_notas:    notas.trim() || null,
    }, 'Cuenta creada. El producto salió del inventario.')

    if (ok) { setShowCreate(false); resetCreate() }
  }

  // ── Devolución ──────────────────────────────────────────────────────────────

  function openDevolucion(c: CuentaCobrar) {
    setDevolCuenta(c)
    setDevolQty({})
    setError('')
  }

  async function handleDevolucion() {
    if (!devolCuenta) return
    const items = Object.entries(devolQty)
      .map(([item_id, v]) => ({ item_id, cantidad: Number(v) || 0 }))
      .filter(i => i.cantidad > 0)

    if (items.length === 0) { setError('Indica cuántas unidades se devuelven'); return }

    const ok = await runRpc('registrar_devolucion', {
      p_cuenta_id: devolCuenta.id,
      p_items: items,
    }, 'Devolución registrada. El producto volvió al inventario.')

    if (ok) setDevolCuenta(null)
  }

  // ── Facturar ────────────────────────────────────────────────────────────────

  function openFacturar(c: CuentaCobrar) {
    setFacturar(c)
    setMetodoPago(metodosPago[0]?.nombre ?? '')
    setCajaId(cajas[0]?.id ?? '')
    setError('')
  }

  async function handleFacturar() {
    if (!facturarCuenta) return
    const ok = await runRpc('facturar_cuenta_cobrar', {
      p_cuenta_id:   facturarCuenta.id,
      p_metodo_pago: metodoPago,
      p_caja_id:     cajaId,
    }, `Cuenta #${facturarCuenta.numero} facturada. Ya aparece en Facturas.`)

    if (ok) setFacturar(null)
  }

  async function handleAnular(c: CuentaCobrar) {
    if (!confirm(`¿Anular la cuenta #${c.numero}? Todo el producto vigente volverá al inventario.`)) return
    await runRpc('anular_cuenta_cobrar', { p_cuenta_id: c.id }, `Cuenta #${c.numero} anulada.`)
  }

  // ── Derivados ───────────────────────────────────────────────────────────────

  const visibles     = filtro === 'todas' ? cuentas : cuentas.filter(c => c.estado === filtro)
  const pendientes   = cuentas.filter(c => c.estado === 'pendiente')
  const totalPend    = pendientes.reduce((s, c) => s + c.total, 0)
  const masAntigua   = pendientes.reduce<CuentaCobrar | null>(
    (old, c) => !old || c.fecha_entrega < old.fecha_entrega ? c : old, null)

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Cuentas x Cobrar</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            Mercancía entregada en consignación · {pendientes.length} pendiente(s)
          </p>
        </div>
        <button onClick={() => { resetCreate(); setShowCreate(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shrink-0"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <Plus size={16} /> Nueva entrega
        </button>
      </div>

      {okMsg && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
          style={{ background: '#d1fae5', color: '#065f46' }}>
          <CheckCircle2 size={16} /> {okMsg}
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={<HandCoins size={18} style={{ color: '#92400e' }} />} bg="#fef3c7"
          label="Pendiente por cobrar" value={formatCOP(totalPend)} valueColor="#92400e" />
        <SummaryCard icon={<Package size={18} style={{ color: '#1e40af' }} />} bg="#dbeafe"
          label="Cuentas abiertas" value={String(pendientes.length)} valueColor="var(--foreground)" />
        <SummaryCard icon={<Clock size={18} style={{ color: '#b91c1c' }} />} bg="#fee2e2"
          label="Entrega más antigua"
          value={masAntigua ? `${diasDesde(masAntigua.fecha_entrega)} días` : '—'}
          valueColor={masAntigua && diasDesde(masAntigua.fecha_entrega) > 60 ? '#dc2626' : 'var(--foreground)'} />
      </div>

      {/* ── Filtros ── */}
      <div className="flex gap-2 flex-wrap">
        {(['pendiente', 'pagada', 'anulada', 'todas'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filtro === f ? 'var(--primary)' : 'var(--secondary)',
              color: filtro === f ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            }}>
            {f === 'todas' ? 'Todas' : ESTADO_CONFIG[f].label}
          </button>
        ))}
      </div>

      {/* ── Tabla ── */}
      <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--secondary)' }}>
                {['#', 'Cliente', 'Entrega', 'Días', 'Total', 'Estado', 'Acciones'].map((h, i) => (
                  <th key={h}
                    className={`px-4 py-3 text-left font-medium ${i === 3 || i === 2 ? 'hidden sm:table-cell' : ''}`}
                    style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {visibles.map(c => {
                const cfg   = ESTADO_CONFIG[c.estado]
                const dias  = diasDesde(c.fecha_entrega)
                const abierta = c.estado === 'pendiente'
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium" style={{ color: 'var(--primary)' }}>#{c.numero}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--foreground)' }}>
                      {c.customer?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>
                      {formatDate(c.fecha_entrega)}
                    </td>
                    <td className="px-4 py-3 text-xs hidden sm:table-cell"
                      style={{ color: abierta && dias > 60 ? '#dc2626' : 'var(--muted-foreground)', fontWeight: abierta && dias > 60 ? 600 : 400 }}>
                      {abierta ? `${dias}d` : '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: 'var(--primary)' }}>{formatCOP(c.total)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                        style={{ background: cfg.bg, color: cfg.color }}>
                        {cfg.label}{c.estado === 'pagada' && c.order?.order_number ? ` #${c.order.order_number}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 items-center">
                        <IconBtn icon={Eye} label="Ver detalle" color="#374151"
                          onClick={() => setVerCuenta(c)} />
                        {abierta && (
                          <>
                            <IconBtn icon={Undo2} label="Registrar devolución" color="#c4832a"
                              disabled={busy} onClick={() => openDevolucion(c)} />
                            <IconBtn icon={Receipt} label="Facturar (cliente pagó)" color="#16a34a"
                              disabled={busy} onClick={() => openFacturar(c)} />
                            <IconBtn icon={Ban} label="Anular cuenta" color="#dc2626"
                              disabled={busy} onClick={() => handleAnular(c)} />
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
        {visibles.length === 0 && (
          <div className="py-16 text-center">
            <HandCoins size={40} className="mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {filtro === 'pendiente' ? 'No hay cuentas pendientes por cobrar' : 'Sin cuentas'}
            </p>
          </div>
        )}
      </div>

      {/* ══ Modal: nueva entrega ══════════════════════════════ */}
      {showCreate && (
        <Modal onClose={() => !busy && setShowCreate(false)} title="Nueva entrega en consignación"
          subtitle="El producto sale del inventario ahora; el cobro se registra cuando el cliente pague.">
          <div className="space-y-4">
            <Field label="Cliente">
              <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="input-field">
                <option value="">Selecciona un cliente...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </Field>

            <Field label="Lista de precios">
              <div className="flex gap-2">
                {([['precio1', 'Distribuidor'], ['precio2', 'Público']] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setTier(v)}
                    className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: tier === v ? 'var(--primary)' : 'var(--secondary)',
                      color: tier === v ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                    }}>{l}</button>
                ))}
              </div>
            </Field>

            <Field label="Agregar producto">
              <div className="flex gap-2">
                <select value={selProd} onChange={e => setSelProd(e.target.value)} className="input-field flex-1">
                  <option value="">Producto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatCOP(p[tier])} (stock {p.stock})
                    </option>
                  ))}
                </select>
                {/* `.input-field` trae width:100%, que le gana a `w-20`. El ancho
                    se fija en el contenedor para no depender del orden del CSS. */}
                <div className="w-20 shrink-0">
                  <input type="number" min="1" value={selQty} onChange={e => setSelQty(e.target.value)}
                    className="input-field" />
                </div>
                <button type="button" onClick={addToCart} disabled={!selProd}
                  className="px-3 rounded-lg text-sm font-medium disabled:opacity-40"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                  <Plus size={16} />
                </button>
              </div>
            </Field>

            {cart.length > 0 && (
              <div className="rounded-xl border divide-y" style={{ borderColor: 'var(--border)' }}>
                {cart.map(i => (
                  <div key={i.product.id} className="flex items-center gap-2 p-2.5 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: 'var(--foreground)' }}>{i.product.name}</p>
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {i.quantity} × {formatCOP(i.product[tier])}
                      </p>
                    </div>
                    <span className="font-semibold" style={{ color: 'var(--primary)' }}>
                      {formatCOP(i.product[tier] * i.quantity)}
                    </span>
                    <button type="button" onClick={() => setCart(prev => prev.filter(x => x.product.id !== i.product.id))}
                      className="p-1 rounded hover:bg-red-50">
                      <Trash2 size={14} style={{ color: '#dc2626' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Descuento">
                <input type="number" min="0" step="100" value={descuento}
                  onChange={e => setDescuento(e.target.value)} className="input-field" />
              </Field>
              <div className="flex flex-col justify-end pb-1">
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Total a cobrar</p>
                <p className="text-xl font-bold" style={{ color: 'var(--primary)' }}>{formatCOP(totalCart)}</p>
              </div>
            </div>

            <Field label="Notas">
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                className="input-field resize-none" placeholder="Opcional..." />
            </Field>

            {error && <ErrorBox msg={error} />}

            <ModalActions onCancel={() => setShowCreate(false)} busy={busy}
              confirmLabel="Registrar entrega" onConfirm={handleCreate} />
          </div>
        </Modal>
      )}

      {/* ══ Modal: devolución ═════════════════════════════════ */}
      {devolCuenta && (
        <Modal onClose={() => !busy && setDevolCuenta(null)}
          title={`Devolución · cuenta #${devolCuenta.numero}`}
          subtitle="Producto que el cliente no logró vender. Vuelve al inventario y baja el monto a cobrar.">
          <div className="space-y-4">
            <div className="rounded-xl border divide-y" style={{ borderColor: 'var(--border)' }}>
              {(devolCuenta.items ?? []).map(it => {
                const disp  = vigente(it)
                const usado = Math.min(Number(devolQty[it.id]) || 0, disp)
                const agotado = disp === 0
                return (
                  <div key={it.id} className="p-3 space-y-2">
                    {/* Nombre y precio en su propia línea: en pantallas
                        angostas no hay ancho para ponerlos junto al input. */}
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium text-sm truncate min-w-0" style={{ color: 'var(--foreground)' }}>
                        {it.product_name}
                      </p>
                      <span className="text-xs shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                        {formatCOP(it.unit_price)} c/u
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-20 shrink-0">
                        <input type="number" min="0" max={disp} disabled={agotado}
                          value={devolQty[it.id] ?? ''} placeholder="0"
                          onChange={e => setDevolQty(p => ({ ...p, [it.id]: e.target.value }))}
                          className="input-field disabled:opacity-40" />
                      </div>
                      <span className="text-xs shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                        {agotado ? 'ya devuelto' : `de ${disp} vigente${disp !== 1 ? 's' : ''}`}
                      </span>
                      {!agotado && usado < disp && (
                        <button type="button"
                          onClick={() => setDevolQty(p => ({ ...p, [it.id]: String(disp) }))}
                          className="ml-auto text-xs px-2 py-1 rounded-md shrink-0"
                          style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}>
                          Todo
                        </button>
                      )}
                      {usado > 0 && (
                        <span className="ml-auto text-xs font-medium shrink-0" style={{ color: '#c4832a' }}>
                          −{formatCOP(usado * it.unit_price)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Impacto de la devolución antes de confirmarla. Replica el
                cálculo de recalcular_cuenta_cobrar, incluido el recorte del
                descuento cuando el subtotal queda por debajo. */}
            {(() => {
              const items    = devolCuenta.items ?? []
              const unidades = items.reduce((s, it) => s + Math.min(Number(devolQty[it.id]) || 0, vigente(it)), 0)
              if (unidades === 0) return null
              const nuevoSub  = items.reduce((s, it) =>
                s + (vigente(it) - Math.min(Number(devolQty[it.id]) || 0, vigente(it))) * it.unit_price, 0)
              const nuevoTot  = nuevoSub - Math.min(devolCuenta.discount, nuevoSub)
              return (
                <div className="rounded-xl p-3 flex items-center justify-between gap-3"
                  style={{ background: 'var(--secondary)' }}>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    Vuelven {unidades} unidad{unidades !== 1 ? 'es' : ''} al inventario
                  </span>
                  <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--foreground)' }}>
                    {formatCOP(devolCuenta.total)} → <span style={{ color: 'var(--primary)' }}>{formatCOP(nuevoTot)}</span>
                  </span>
                </div>
              )
            })()}

            {error && <ErrorBox msg={error} />}

            <ModalActions onCancel={() => setDevolCuenta(null)} busy={busy}
              confirmLabel="Registrar devolución" onConfirm={handleDevolucion} />
          </div>
        </Modal>
      )}

      {/* ══ Modal: facturar ═══════════════════════════════════ */}
      {facturarCuenta && (
        <Modal onClose={() => !busy && setFacturar(null)}
          title={`Facturar cuenta #${facturarCuenta.numero}`}
          subtitle="Se generará una factura y el dinero entrará a la caja que elijas.">
          <div className="space-y-4">
            <div className="rounded-xl p-4" style={{ background: 'var(--secondary)' }}>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {facturarCuenta.customer?.full_name ?? 'Sin cliente'} · entregado {formatDate(facturarCuenta.fecha_entrega)}
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--primary)' }}>
                {formatCOP(facturarCuenta.total)}
              </p>
            </div>

            <Field label="Método de pago usado">
              <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} className="input-field">
                {metodosPago.map(m => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
              </select>
            </Field>

            <Field label="Caja donde entra el dinero">
              <select value={cajaId} onChange={e => setCajaId(e.target.value)} className="input-field">
                {cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Field>

            <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--muted-foreground)' }}>
              <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: '#c4832a' }} />
              El inventario no se mueve: el producto ya salió cuando se entregó.
            </p>

            {error && <ErrorBox msg={error} />}

            <ModalActions onCancel={() => setFacturar(null)} busy={busy}
              confirmLabel="Confirmar pago y facturar" onConfirm={handleFacturar} />
          </div>
        </Modal>
      )}

      {/* ══ Modal: detalle ════════════════════════════════════ */}
      {verCuenta && (
        <Modal onClose={() => setVerCuenta(null)}
          title={`Cuenta #${verCuenta.numero}`}
          subtitle={`${verCuenta.customer?.full_name ?? 'Sin cliente'} · entregado ${formatDateTime(verCuenta.fecha_entrega)}`}>
          <div className="space-y-4">
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--secondary)' }}>
                    {['Producto', 'Entregado', 'Devuelto', 'Cobrado'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-xs"
                        style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {(verCuenta.items ?? []).map(it => (
                    <tr key={it.id}>
                      <td className="px-3 py-2" style={{ color: 'var(--foreground)' }}>{it.product_name}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--muted-foreground)' }}>{it.cantidad_entregada}</td>
                      <td className="px-3 py-2" style={{ color: it.cantidad_devuelta > 0 ? '#c4832a' : 'var(--muted-foreground)' }}>
                        {it.cantidad_devuelta}
                      </td>
                      <td className="px-3 py-2 font-medium" style={{ color: 'var(--primary)' }}>
                        {vigente(it)} · {formatCOP(it.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center px-1">
              <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                {verCuenta.discount > 0 ? `Descuento ${formatCOP(verCuenta.discount)}` : 'Sin descuento'}
              </span>
              <span className="text-xl font-bold" style={{ color: 'var(--primary)' }}>
                {formatCOP(verCuenta.total)}
              </span>
            </div>

            {verCuenta.estado === 'pagada' && verCuenta.fecha_pago && (
              <p className="text-sm p-3 rounded-lg" style={{ background: '#d1fae5', color: '#065f46' }}>
                Facturada el {formatDateTime(verCuenta.fecha_pago)}
                {verCuenta.order?.order_number ? ` · factura #${verCuenta.order.order_number}` : ''}
              </p>
            )}

            {verCuenta.notas && (
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{verCuenta.notas}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function IconBtn({ icon: Icon, label, color, onClick, disabled = false }: {
  icon: React.ElementType; label: string; color: string
  onClick: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} title={label} disabled={disabled}
      className="p-1.5 rounded-lg transition-colors hover:bg-gray-100 disabled:opacity-40">
      <Icon size={14} style={{ color }} />
    </button>
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

function ErrorBox({ msg }: { msg: string }) {
  return (
    <p className="text-sm p-3 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{msg}</p>
  )
}

function ModalActions({ onCancel, onConfirm, confirmLabel, busy }: {
  onCancel: () => void; onConfirm: () => void; confirmLabel: string; busy: boolean
}) {
  return (
    <div className="flex gap-3 pt-1">
      <button onClick={onCancel} disabled={busy}
        className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
        style={{ background: 'var(--secondary)', color: 'var(--foreground)' }}>
        Cancelar
      </button>
      <button onClick={onConfirm} disabled={busy}
        className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
        {busy && <Loader2 size={14} className="animate-spin" />}
        {busy ? 'Procesando...' : confirmLabel}
      </button>
    </div>
  )
}

function Modal({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '1rem',
        background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#fff', borderRadius: '1.25rem', padding: '1.5rem',
        width: '100%', maxWidth: '34rem', boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>{title}</h2>
            {subtitle && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 shrink-0">
            <X size={16} style={{ color: 'var(--muted-foreground)' }} />
          </button>
        </div>
        {children}
      </div>
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
