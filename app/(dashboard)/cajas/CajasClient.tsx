'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Caja, MovimientoCaja, CajaTipo, MetodoPago } from '@/lib/types'
import { formatCOP, formatDateTime } from '@/lib/utils'
import { Wallet, Banknote, Plus, Pencil, TrendingUp, TrendingDown, X, Sigma, ArrowLeftRight, Receipt, ChevronRight } from 'lucide-react'
import { useEscKey } from '@/lib/hooks/useEscKey'
import { MovimientosCajaModal } from './MovimientosCajaModal'

type CajaWithBalance = Caja & { saldo_actual: number }
type MovimientoWithCaja = MovimientoCaja & {
  caja: Pick<Caja, 'nombre' | 'tipo'>
  orden: { customer: { full_name: string } | null } | null
}

const TIPO_LABELS: Record<CajaTipo, string> = { efectivo: 'Efectivo', bancaria: 'Bancaria' }

export function CajasClient({
  cajas: initialCajas,
  movimientos: initialMovimientos,
  metodosPago,
}: {
  cajas: CajaWithBalance[]
  movimientos: MovimientoWithCaja[]
  metodosPago: MetodoPago[]
}) {
  const [cajas, setCajas] = useState(initialCajas)
  const [movimientos] = useState(initialMovimientos)
  const [filterCajaTipo, setFilterCajaTipo] = useState<'todas' | 'efectivo' | 'bancaria'>('todas')
  const [filterTipo, setFilterTipo] = useState<'todos' | 'ingreso' | 'egreso'>('todos')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<CajaWithBalance | null>(null)
  const [form, setForm] = useState({ nombre: '', tipo: 'efectivo' as CajaTipo, saldo_inicial: '0', metodo_pago_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Traslado de fondos
  const [showTraslado, setShowTraslado]   = useState(false)
  const [tForm, setTForm]                 = useState({ origen_id: '', destino_id: '', monto: '', concepto: '' })
  const [tSaving, setTSaving]             = useState(false)
  const [tError, setTError]               = useState('')

  // Detalle de transacciones por caja
  const [detalleCaja, setDetalleCaja] = useState<CajaWithBalance | null>(null)

  useEscKey(() => {
    if (detalleCaja) return          // el modal de detalle maneja su propio ESC
    if (showTraslado) { setShowTraslado(false); return }
    setShowModal(false)
  })

  function openCreate() {
    setEditing(null)
    setForm({ nombre: '', tipo: 'efectivo', saldo_inicial: '0', metodo_pago_id: '' })
    setError('')
    setShowModal(true)
  }

  function openEdit(caja: CajaWithBalance) {
    setEditing(caja)
    setForm({ nombre: caja.nombre, tipo: caja.tipo, saldo_inicial: String(caja.saldo_inicial), metodo_pago_id: caja.metodo_pago_id ?? '' })
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return }
    const saldo = Number(form.saldo_inicial)
    if (isNaN(saldo)) { setError('Saldo inicial inválido'); return }
    setSaving(true)
    setError('')
    const supabase = createClient()

    const metodoPagoId = form.metodo_pago_id || null

    if (editing) {
      const { data, error: err } = await supabase
        .from('cajas')
        .update({ nombre: form.nombre.trim(), saldo_inicial: saldo, metodo_pago_id: metodoPagoId, updated_at: new Date().toISOString() })
        .eq('id', editing.id)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      const metodo = metodosPago.find(m => m.id === metodoPagoId) ?? null
      setCajas(prev => prev.map(c => c.id === editing.id
        ? { ...data, metodo_pago: metodo ?? undefined, saldo_actual: saldo + (editing.saldo_actual - editing.saldo_inicial) }
        : c
      ))
    } else {
      const { data, error: err } = await supabase
        .from('cajas')
        .insert({ nombre: form.nombre.trim(), tipo: form.tipo, saldo_inicial: saldo, metodo_pago_id: metodoPagoId })
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      const metodo = metodosPago.find(m => m.id === metodoPagoId) ?? null
      setCajas(prev => [...prev, { ...data, metodo_pago: metodo ?? undefined, saldo_actual: saldo }])
    }

    setSaving(false)
    setShowModal(false)
  }

  async function toggleActiva(caja: CajaWithBalance) {
    const supabase = createClient()
    const { data } = await supabase
      .from('cajas')
      .update({ activa: !caja.activa, updated_at: new Date().toISOString() })
      .eq('id', caja.id)
      .select()
      .single()
    if (data) setCajas(prev => prev.map(c => c.id === caja.id ? { ...c, activa: data.activa } : c))
  }

  async function handleTraslado() {
    const monto = Number(tForm.monto)
    if (!tForm.origen_id)  { setTError('Selecciona la caja origen');   return }
    if (!tForm.destino_id) { setTError('Selecciona la caja destino');  return }
    if (tForm.origen_id === tForm.destino_id) { setTError('Las cajas deben ser diferentes'); return }
    if (!monto || monto <= 0) { setTError('Ingresa un monto válido'); return }

    setTSaving(true); setTError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error: rpcErr } = await supabase.rpc('trasladar_fondos', {
      p_origen_id:  tForm.origen_id,
      p_destino_id: tForm.destino_id,
      p_monto:      monto,
      p_concepto:   tForm.concepto || null,
      p_user_id:    user?.id ?? null,
    })

    if (rpcErr || data?.error) {
      setTError(rpcErr?.message ?? data?.error)
      setTSaving(false)
      return
    }

    // Actualizar saldos localmente
    setCajas(prev => prev.map(c => {
      if (c.id === tForm.origen_id)  return { ...c, saldo_actual: c.saldo_actual - monto }
      if (c.id === tForm.destino_id) return { ...c, saldo_actual: c.saldo_actual + monto }
      return c
    }))

    setTSaving(false)
    setShowTraslado(false)
    setTForm({ origen_id: '', destino_id: '', monto: '', concepto: '' })
  }

  const totalEfectivo = cajas.filter(c => c.tipo === 'efectivo').reduce((s, c) => s + c.saldo_actual, 0)
  const totalBancaria = cajas.filter(c => c.tipo === 'bancaria').reduce((s, c) => s + c.saldo_actual, 0)
  const totalGeneral  = totalEfectivo + totalBancaria

  const movimientosFiltrados = movimientos
    .filter(m => filterCajaTipo === 'todas' || m.caja?.tipo === filterCajaTipo)
    .filter(m => filterTipo === 'todos' || m.tipo === filterTipo)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Cajas</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Saldos y movimientos</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setTForm({ origen_id: '', destino_id: '', monto: '', concepto: '' }); setTError(''); setShowTraslado(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)', background: '#fff' }}>
            <ArrowLeftRight size={15} /> Traslado
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            <Plus size={16} /> Nueva Caja
          </button>
        </div>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cajas.map(caja => (
          <div key={caja.id} className="rounded-2xl border p-5"
            style={{ background: '#fff', borderColor: 'var(--border)', opacity: caja.activa ? 1 : 0.5 }}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: caja.tipo === 'efectivo' ? '#d1fae5' : '#dbeafe' }}>
                  {caja.tipo === 'efectivo'
                    ? <Banknote size={18} style={{ color: '#065f46' }} />
                    : <Wallet size={18} style={{ color: '#1e40af' }} />}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{caja.nombre}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        background: caja.tipo === 'efectivo' ? '#d1fae5' : '#dbeafe',
                        color: caja.tipo === 'efectivo' ? '#065f46' : '#1e40af',
                      }}>
                      {TIPO_LABELS[caja.tipo]}
                    </span>
                    {(caja as any).metodo_pago?.nombre && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: 'var(--secondary)', color: 'var(--primary)' }}>
                        {(caja as any).metodo_pago.nombre}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => openEdit(caja)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <Pencil size={14} style={{ color: 'var(--muted-foreground)' }} />
              </button>
            </div>
            <p className="text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>Saldo actual</p>
            <p className="text-2xl font-bold" style={{ color: caja.saldo_actual >= 0 ? 'var(--primary)' : '#dc2626' }}>
              {formatCOP(caja.saldo_actual)}
            </p>
            {caja.saldo_inicial !== 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                Saldo inicial: {formatCOP(caja.saldo_inicial)}
              </p>
            )}
            {!caja.activa && (
              <button onClick={() => toggleActiva(caja)}
                className="mt-3 text-xs underline" style={{ color: 'var(--muted-foreground)' }}>
                Activar caja
              </button>
            )}

            {/* Ver transacciones */}
            <button
              onClick={() => setDetalleCaja(caja)}
              className="group mt-4 pt-3 w-full flex items-center justify-between border-t text-xs font-medium transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted-foreground)' }}>
              <span className="flex items-center gap-1.5">
                <Receipt size={13} /> Ver transacciones
              </span>
              <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Totalizador general */}
      <div className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-0"
        style={{ background: 'linear-gradient(135deg, #2c1810 0%, #4a2c1a 100%)', boxShadow: '0 4px 24px rgba(44,24,16,0.25)' }}>

        {/* Ícono + label */}
        <div className="flex items-center gap-3 sm:flex-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.12)' }}>
            <Sigma size={20} style={{ color: '#f5d9b0' }} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Total General
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {cajas.length} {cajas.length === 1 ? 'caja' : 'cajas'}
            </p>
          </div>
        </div>

        {/* Desglose por tipo */}
        <div className="flex gap-6 sm:justify-center sm:flex-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(209,250,229,0.15)' }}>
              <Banknote size={13} style={{ color: '#6ee7b7' }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Efectivo</p>
              <p className="text-sm font-semibold" style={{ color: '#6ee7b7' }}>{formatCOP(totalEfectivo)}</p>
            </div>
          </div>
          <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} className="hidden sm:block" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(219,234,254,0.15)' }}>
              <Wallet size={13} style={{ color: '#93c5fd' }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Bancaria</p>
              <p className="text-sm font-semibold" style={{ color: '#93c5fd' }}>{formatCOP(totalBancaria)}</p>
            </div>
          </div>
        </div>

        {/* Total grande */}
        <div className="text-right sm:flex-1">
          <p className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Saldo total
          </p>
          <p className="text-3xl font-bold" style={{ color: totalGeneral >= 0 ? '#f5d9b0' : '#fca5a5' }}>
            {formatCOP(totalGeneral)}
          </p>
        </div>
      </div>

      {/* Movimientos */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Movimientos</h2>
          <div className="flex flex-wrap gap-4">
            {/* Filtro por tipo de caja */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Caja:</span>
              <div className="flex gap-1">
                {([
                  { key: 'todas', label: 'Todas' },
                  { key: 'efectivo', label: 'Efectivo' },
                  { key: 'bancaria', label: 'Bancaria' },
                ] as const).map(opt => (
                  <button key={opt.key} onClick={() => setFilterCajaTipo(opt.key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: filterCajaTipo === opt.key ? 'var(--primary)' : 'var(--secondary)',
                      color: filterCajaTipo === opt.key ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtro por tipo de movimiento */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Tipo:</span>
              <div className="flex gap-1">
                {([
                  { key: 'todos', label: 'Todos' },
                  { key: 'ingreso', label: 'Ingreso' },
                  { key: 'egreso', label: 'Egreso' },
                ] as const).map(opt => (
                  <button key={opt.key} onClick={() => setFilterTipo(opt.key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: filterTipo === opt.key ? 'var(--primary)' : 'var(--secondary)',
                      color: filterTipo === opt.key ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--secondary)' }}>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>Fecha</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Tipo</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Concepto</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>Caja</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {movimientosFiltrados.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{formatDateTime(m.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-xs font-medium w-fit px-2 py-0.5 rounded-full"
                      style={{
                        background: m.tipo === 'ingreso' ? '#d1fae5' : '#fee2e2',
                        color: m.tipo === 'ingreso' ? '#065f46' : '#991b1b',
                      }}>
                      {m.tipo === 'ingreso' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                    </span>
                  </td>
                  <td className="px-4 py-3 relative group" style={{ color: 'var(--foreground)' }}>
                    <span className="cursor-default">{m.concepto}</span>
                    {m.orden?.customer?.full_name && (
                      <div className="absolute left-4 bottom-full mb-1.5 z-20 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
                        <div className="text-xs px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap"
                          style={{ background: '#1a1a1a', color: '#f5f5f5' }}>
                          Cliente: {m.orden.customer.full_name}
                        </div>
                        <div className="w-2 h-2 rotate-45 mx-3"
                          style={{ background: '#1a1a1a', marginTop: '-4px' }} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{m.caja?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold"
                    style={{ color: m.tipo === 'ingreso' ? '#16a34a' : '#dc2626' }}>
                    {m.tipo === 'ingreso' ? '+' : '-'}{formatCOP(m.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {movimientosFiltrados.length === 0 && (
            <div className="py-16 text-center">
              <Wallet size={36} className="mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Sin movimientos</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal detalle de transacciones ─────────────────── */}
      {detalleCaja && (
        <MovimientosCajaModal
          caja={detalleCaja}
          onClose={() => setDetalleCaja(null)}
        />
      )}

      {/* ── Modal traslado de fondos ───────────────────────── */}
      {showTraslado && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowTraslado(false) }}>
          <div style={{ background: '#fff', borderRadius: '1.25rem', width: '100%', maxWidth: '26rem', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: '#EFF6FF' }}>
                  <ArrowLeftRight size={15} style={{ color: '#3B82F6' }} />
                </div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>Traslado de fondos</h2>
              </div>
              <button onClick={() => setShowTraslado(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={16} style={{ color: 'var(--muted-foreground)' }} />
              </button>
            </div>

            <div className="p-6 space-y-4">

              {/* Origen */}
              <Field label="Caja origen *">
                <select
                  value={tForm.origen_id}
                  onChange={e => setTForm(f => ({ ...f, origen_id: e.target.value }))}
                  className="input-field">
                  <option value="">Seleccionar...</option>
                  {cajas.filter(c => c.activa).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} — {formatCOP(c.saldo_actual)}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Flecha visual */}
              <div className="flex justify-center">
                <div className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--secondary)' }}>
                  <ArrowLeftRight size={14} style={{ color: 'var(--muted-foreground)', transform: 'rotate(90deg)' }} />
                </div>
              </div>

              {/* Destino */}
              <Field label="Caja destino *">
                <select
                  value={tForm.destino_id}
                  onChange={e => setTForm(f => ({ ...f, destino_id: e.target.value }))}
                  className="input-field">
                  <option value="">Seleccionar...</option>
                  {cajas.filter(c => c.activa && c.id !== tForm.origen_id).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} — {formatCOP(c.saldo_actual)}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Monto */}
              <Field label="Monto *">
                <input
                  type="number" min="1" step="100"
                  value={tForm.monto}
                  onChange={e => setTForm(f => ({ ...f, monto: e.target.value }))}
                  placeholder="0"
                  className="input-field" />
              </Field>

              {/* Preview saldos */}
              {tForm.origen_id && tForm.destino_id && Number(tForm.monto) > 0 && (() => {
                const origen  = cajas.find(c => c.id === tForm.origen_id)
                const destino = cajas.find(c => c.id === tForm.destino_id)
                const monto   = Number(tForm.monto)
                if (!origen || !destino) return null
                return (
                  <div className="rounded-xl p-3.5 space-y-2 text-xs" style={{ background: 'var(--secondary)' }}>
                    <p className="font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                      Vista previa
                    </p>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--foreground)' }}>{origen.nombre}</span>
                      <span style={{ color: (origen.saldo_actual - monto) < 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                        {formatCOP(origen.saldo_actual)} → {formatCOP(origen.saldo_actual - monto)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--foreground)' }}>{destino.nombre}</span>
                      <span style={{ color: '#16a34a', fontWeight: 600 }}>
                        {formatCOP(destino.saldo_actual)} → {formatCOP(destino.saldo_actual + monto)}
                      </span>
                    </div>
                    {(origen.saldo_actual - monto) < 0 && (
                      <p style={{ color: '#dc2626' }}>⚠️ La caja origen quedaría en negativo</p>
                    )}
                  </div>
                )
              })()}

              {/* Concepto opcional */}
              <Field label="Concepto (opcional)">
                <input
                  type="text"
                  value={tForm.concepto}
                  onChange={e => setTForm(f => ({ ...f, concepto: e.target.value }))}
                  placeholder="Ej: Cambio para billetes, arqueo..."
                  className="input-field" />
              </Field>

              {tError && (
                <p className="text-sm p-3 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{tError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowTraslado(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button onClick={handleTraslado} disabled={tSaving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
                  style={{ background: '#3B82F6', color: '#fff' }}>
                  {tSaving ? 'Trasladando...' : 'Confirmar traslado'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear / editar caja */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-xl" style={{ background: '#fff' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
                {editing ? 'Editar caja' : 'Nueva caja'}
              </h2>
              <button onClick={() => setShowModal(false)}><X size={18} style={{ color: 'var(--muted-foreground)' }} /></button>
            </div>

            <div className="p-6 space-y-4">
              <Field label="Nombre *">
                <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Caja Principal" className="input-field" />
              </Field>

              {!editing && (
                <Field label="Tipo *">
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as CajaTipo }))}
                    className="input-field">
                    <option value="efectivo">Efectivo</option>
                    <option value="bancaria">Bancaria (transferencias)</option>
                  </select>
                </Field>
              )}

              <Field label="Método de pago asociado">
                <select
                  value={form.metodo_pago_id}
                  onChange={e => setForm(f => ({ ...f, metodo_pago_id: e.target.value }))}
                  className="input-field">
                  <option value="">— Sin método específico —</option>
                  {metodosPago.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
                <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                  Al completar una venta con este método, el ingreso se registrará en esta caja.
                </p>
              </Field>

              <Field label="Saldo inicial">
                <input type="number" min="0" step="100" value={form.saldo_inicial}
                  onChange={e => setForm(f => ({ ...f, saldo_inicial: e.target.value }))}
                  className="input-field" />
              </Field>

              {editing && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm" style={{ color: 'var(--foreground)' }}>Caja activa</span>
                  <button onClick={() => toggleActiva(editing)}
                    className="w-10 h-5 rounded-full transition-colors relative"
                    style={{ background: editing.activa ? 'var(--primary)' : 'var(--border)' }}>
                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                      style={{ left: editing.activa ? '1.25rem' : '0.125rem' }} />
                  </button>
                </div>
              )}

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
                  {saving ? 'Guardando...' : 'Guardar'}
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
