'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Presentation, TipoProducto, Configuracion, MetodoPago } from '@/lib/types'
import { formatCOP } from '@/lib/utils'
import { Plus, Pencil, Check, X, Coffee, Package, Building2, CreditCard, Upload, Trash2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type LookupItem = {
  id: string
  nombre: string
  orden: number
  created_at: string
  activa?: boolean
  activo?: boolean
  comision?: number | null
}

/**
 * Lee el campo de comisión del formulario.
 *
 * Vacío es un valor legítimo: significa "sin tarifa definida", que no es lo
 * mismo que 0 ("no paga comisión"). El informe de liquidación trata ambos casos
 * distinto, así que no se colapsan aquí.
 */
function parseComision(valor: string): { ok: true; valor: number | null } | { ok: false } {
  const limpio = valor.trim()
  if (!limpio) return { ok: true, valor: null }
  const n = Number(limpio)
  if (!Number.isFinite(n) || n < 0) return { ok: false }
  return { ok: true, valor: n }
}

type Tab = 'presentaciones' | 'tipos' | 'metodos_pago' | 'negocio'

const TABS: { id: Tab; label: string; icon: React.ElementType; desc: string }[] = [
  {
    id: 'presentaciones',
    label: 'Presentaciones',
    icon: Package,
    desc: 'Formatos disponibles para los productos (ej: 45g, 250g, 500g, 1kg). La comisión es el valor fijo en COP que gana el vendedor por cada bolsa de esa presentación; las ventas ya registradas conservan la comisión con la que se liquidaron.',
  },
  {
    id: 'tipos',
    label: 'Tipos de Café',
    icon: Coffee,
    desc: 'Categorías de preparación (ej: grano, molido, descafeinado, blend especial).',
  },
  {
    id: 'metodos_pago',
    label: 'Métodos de Pago',
    icon: CreditCard,
    desc: 'Medios de pago aceptados — aparecen en el módulo de Pedidos y al crear cajas.',
  },
  {
    id: 'negocio',
    label: 'Negocio',
    icon: Building2,
    desc: 'Información del negocio que aparece en facturas y documentos.',
  },
]

// ─── Tipo labels for MetodoPago ───────────────────────────────
const TIPO_METODO: Record<string, string> = {
  efectivo: 'Efectivo',
  digital:  'Digital',
  tarjeta:  'Tarjeta',
  otro:     'Otro',
}

// ─── MetodosPagoPanel ─────────────────────────────────────────
function MetodosPagoPanel({ initialItems }: { initialItems: MetodoPago[] }) {
  const [items, setItems]         = useState([...initialItems].sort((a, b) => a.orden - b.orden))
  const [editing, setEditing]     = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editTipo, setEditTipo]   = useState<MetodoPago['tipo']>('efectivo')
  const [editOrden, setEditOrden] = useState(0)
  const [adding, setAdding]       = useState(false)
  const [newNombre, setNewNombre] = useState('')
  const [newTipo, setNewTipo]     = useState<MetodoPago['tipo']>('digital')
  const [newOrden, setNewOrden]   = useState(initialItems.length + 1)
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')

  async function toggleActive(item: MetodoPago) {
    const supabase = createClient()
    const { error: err } = await supabase
      .from('metodos_pago').update({ activo: !item.activo }).eq('id', item.id)
    if (!err) setItems(prev => prev.map(i => i.id === item.id ? { ...i, activo: !i.activo } : i))
  }

  function startEdit(item: MetodoPago) {
    setEditing(item.id)
    setEditNombre(item.nombre)
    setEditTipo(item.tipo)
    setEditOrden(item.orden)
    setError('')
  }

  async function saveEdit(id: string) {
    if (!editNombre.trim()) return
    setBusy(true)
    setError('')
    const supabase = createClient()
    const { error: err } = await supabase
      .from('metodos_pago')
      .update({ nombre: editNombre.trim(), tipo: editTipo, orden: editOrden })
      .eq('id', id)
    if (err) { setError(err.message); setBusy(false); return }
    setItems(prev =>
      prev.map(i => i.id === id ? { ...i, nombre: editNombre.trim(), tipo: editTipo, orden: editOrden } : i)
        .sort((a, b) => a.orden - b.orden)
    )
    setEditing(null)
    setBusy(false)
  }

  async function handleAdd() {
    if (!newNombre.trim()) return
    setBusy(true)
    setError('')
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('metodos_pago')
      .insert({ nombre: newNombre.trim(), tipo: newTipo, orden: newOrden, activo: true })
      .select()
      .single()
    if (err) { setError(err.message); setBusy(false); return }
    setItems(prev => [...prev, data as MetodoPago].sort((a, b) => a.orden - b.orden))
    setAdding(false)
    setNewNombre('')
    setNewTipo('digital')
    setNewOrden(items.length + 2)
    setBusy(false)
  }

  const tipoSelect = (
    value: MetodoPago['tipo'],
    onChange: (v: MetodoPago['tipo']) => void,
    extraClass = ''
  ) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value as MetodoPago['tipo'])}
      className={`border rounded-md px-2 py-1 text-sm outline-none ${extraClass}`}
      style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
    >
      {Object.entries(TIPO_METODO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  )

  return (
    <div className="max-w-2xl">
      <p className="text-sm mb-5" style={{ color: 'var(--muted-foreground)' }}>
        Métodos de pago aceptados — aparecen en el módulo de Pedidos y al crear cajas.
      </p>

      <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th className="hidden sm:table-cell">Orden</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const isEd = editing === item.id
                return (
                  <tr key={item.id}>
                    <td className="font-medium" style={{ color: 'var(--foreground)' }}>
                      {isEd ? (
                        <input
                          value={editNombre} onChange={e => setEditNombre(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveEdit(item.id)}
                          className="border rounded-md px-2 py-1 text-sm outline-none w-36"
                          style={{ borderColor: 'var(--primary)' }}
                          autoFocus
                        />
                      ) : item.nombre}
                    </td>
                    <td>
                      {isEd
                        ? tipoSelect(editTipo, setEditTipo, 'w-28')
                        : (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: 'var(--secondary)', color: 'var(--primary)' }}>
                            {TIPO_METODO[item.tipo]}
                          </span>
                        )
                      }
                    </td>
                    <td className="hidden sm:table-cell">
                      {isEd ? (
                        <input type="number" value={editOrden}
                          onChange={e => setEditOrden(Number(e.target.value))}
                          className="w-16 border rounded-md px-2 py-1 text-sm text-center outline-none"
                          style={{ borderColor: 'var(--border)' }}
                        />
                      ) : (
                        <span style={{ color: 'var(--muted-foreground)' }}>{item.orden}</span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => toggleActive(item)}
                        className="text-xs px-2 py-0.5 rounded-full font-medium transition-colors"
                        style={{ background: item.activo ? '#dcfce7' : '#fee2e2', color: item.activo ? '#16a34a' : '#dc2626' }}
                      >
                        {item.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td>
                      {isEd ? (
                        <div className="flex gap-1">
                          <button onClick={() => saveEdit(item.id)} disabled={busy}
                            className="p-1.5 rounded-lg hover:bg-green-50 disabled:opacity-40 transition-colors" title="Guardar">
                            <Check size={14} style={{ color: '#16a34a' }} />
                          </button>
                          <button onClick={() => setEditing(null)}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="Cancelar">
                            <X size={14} style={{ color: '#dc2626' }} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(item)}
                          className="btn-icon">
                          <Pencil size={14} style={{ color: 'var(--muted-foreground)' }} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}

              {/* Agregar nuevo */}
              {adding && (
                <tr style={{ background: '#fafafa' }}>
                  <td>
                    <input
                      value={newNombre} onChange={e => setNewNombre(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAdd()}
                      placeholder="ej: PSE, Efecty..."
                      className="border rounded-md px-2 py-1 text-sm outline-none w-36"
                      style={{ borderColor: 'var(--primary)' }}
                      autoFocus
                    />
                  </td>
                  <td>
                    {tipoSelect(newTipo, setNewTipo, 'w-28')}
                  </td>
                  <td className="hidden sm:table-cell">
                    <input type="number" value={newOrden}
                      onChange={e => setNewOrden(Number(e.target.value))}
                      className="w-16 border rounded-md px-2 py-1 text-sm text-center outline-none"
                      style={{ borderColor: 'var(--border)' }}
                    />
                  </td>
                  <td />
                  <td>
                    <div className="flex gap-1">
                      <button onClick={handleAdd} disabled={busy || !newNombre.trim()}
                        className="p-1.5 rounded-lg hover:bg-green-50 disabled:opacity-40 transition-colors" title="Agregar">
                        <Check size={14} style={{ color: '#16a34a' }} />
                      </button>
                      <button onClick={() => { setAdding(false); setNewNombre('') }}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="Cancelar">
                        <X size={14} style={{ color: '#dc2626' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!adding && (
          <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => { setAdding(true); setNewOrden(items.length + 1) }}
              className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: 'var(--primary)' }}>
              <Plus size={15} /> Agregar método de pago
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{error}</p>
      )}
    </div>
  )
}

// ─── Generic lookup panel (Presentaciones & Tipos) ───────────
function LookupPanel({
  initialItems,
  tableName,
  activeKey,
  description,
  withComision = false,
}: {
  initialItems: LookupItem[]
  tableName: string
  activeKey: 'activa' | 'activo'
  description: string
  withComision?: boolean
}) {
  const [items, setItems] = useState([...initialItems].sort((a, b) => a.orden - b.orden))
  const [editing, setEditing] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editOrden, setEditOrden] = useState(0)
  const [editComision, setEditComision] = useState('')
  const [adding, setAdding] = useState(false)
  const [newNombre, setNewNombre] = useState('')
  const [newOrden, setNewOrden] = useState(initialItems.length + 1)
  const [newComision, setNewComision] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function isActive(item: LookupItem) {
    return item[activeKey] ?? true
  }

  async function toggleActive(item: LookupItem) {
    const supabase = createClient()
    const next = !isActive(item)
    const { error: err } = await supabase.from(tableName).update({ [activeKey]: next }).eq('id', item.id)
    if (!err) setItems(prev => prev.map(i => i.id === item.id ? { ...i, [activeKey]: next } : i))
  }

  function startEdit(item: LookupItem) {
    setEditing(item.id)
    setEditNombre(item.nombre)
    setEditOrden(item.orden)
    setEditComision(item.comision == null ? '' : String(item.comision))
    setError('')
  }

  async function saveEdit(id: string) {
    if (!editNombre.trim()) return

    const cambios: Record<string, unknown> = { nombre: editNombre.trim(), orden: editOrden }
    if (withComision) {
      const parsed = parseComision(editComision)
      if (!parsed.ok) { setError('La comisión debe ser un número mayor o igual a cero.'); return }
      cambios.comision = parsed.valor
    }

    setBusy(true)
    setError('')
    const supabase = createClient()
    const { error: err } = await supabase.from(tableName).update(cambios).eq('id', id)
    if (err) { setError(err.message); setBusy(false); return }
    setItems(prev =>
      prev.map(i => i.id === id ? { ...i, ...cambios } as LookupItem : i)
        .sort((a, b) => a.orden - b.orden)
    )
    setEditing(null)
    setBusy(false)
  }

  async function handleAdd() {
    if (!newNombre.trim()) return
    setBusy(true)
    setError('')
    const supabase = createClient()
    const row: Record<string, unknown> = { nombre: newNombre.trim(), orden: newOrden, [activeKey]: true }
    if (withComision) {
      const parsed = parseComision(newComision)
      if (!parsed.ok) { setError('La comisión debe ser un número mayor o igual a cero.'); setBusy(false); return }
      row.comision = parsed.valor
    }
    const { data, error: err } = await supabase.from(tableName).insert(row).select().single()
    if (err) { setError(err.message); setBusy(false); return }
    setItems(prev => [...prev, data as LookupItem].sort((a, b) => a.orden - b.orden))
    setAdding(false)
    setNewNombre('')
    setNewComision('')
    setNewOrden(items.length + 2)
    setBusy(false)
  }

  return (
    <div className="max-w-2xl">
      <p className="text-sm mb-5" style={{ color: 'var(--muted-foreground)' }}>{description}</p>

      <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
        <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="hidden sm:table-cell">Orden</th>
              <th>Nombre</th>
              {withComision && <th>Comisión por bolsa</th>}
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const isEd = editing === item.id
              const active = isActive(item)
              return (
                <tr key={item.id}>
                  <td className="w-24 hidden sm:table-cell">
                    {isEd ? (
                      <input
                        type="number" value={editOrden}
                        onChange={e => setEditOrden(Number(e.target.value))}
                        className="w-16 border rounded-md px-2 py-1 text-sm text-center outline-none"
                        style={{ borderColor: 'var(--border)' }}
                      />
                    ) : (
                      <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{item.orden}</span>
                    )}
                  </td>
                  <td className="font-medium" style={{ color: 'var(--foreground)' }}>
                    {isEd ? (
                      <input
                        value={editNombre} onChange={e => setEditNombre(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveEdit(item.id)}
                        className="border rounded-md px-2 py-1 text-sm outline-none w-48"
                        style={{ borderColor: 'var(--primary)' }}
                        autoFocus
                      />
                    ) : (
                      <span className="capitalize">{item.nombre}</span>
                    )}
                  </td>
                  {withComision && (
                    <td>
                      {isEd ? (
                        <input
                          type="number" min="0" step="0.01"
                          value={editComision}
                          onChange={e => setEditComision(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveEdit(item.id)}
                          placeholder="Sin definir"
                          className="border rounded-md px-2 py-1 text-sm outline-none w-32"
                          style={{ borderColor: 'var(--primary)' }}
                        />
                      ) : item.comision == null ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: '#fef9c3', color: '#92400e' }}>
                          Sin definir
                        </span>
                      ) : (
                        <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                          {formatCOP(item.comision)}
                        </span>
                      )}
                    </td>
                  )}
                  <td>
                    <button
                      onClick={() => toggleActive(item)}
                      className="text-xs px-2 py-0.5 rounded-full font-medium transition-colors"
                      style={{ background: active ? '#dcfce7' : '#fee2e2', color: active ? '#16a34a' : '#dc2626' }}
                    >
                      {active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td>
                    {isEd ? (
                      <div className="flex gap-1">
                        <button onClick={() => saveEdit(item.id)} disabled={busy}
                          className="p-1.5 rounded-lg hover:bg-green-50 disabled:opacity-40 transition-colors"
                          title="Guardar">
                          <Check size={14} style={{ color: '#16a34a' }} />
                        </button>
                        <button onClick={() => setEditing(null)}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          title="Cancelar">
                          <X size={14} style={{ color: '#dc2626' }} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(item)}
                        className="btn-icon">
                        <Pencil size={14} style={{ color: 'var(--muted-foreground)' }} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}

            {/* Fila de agregar nuevo */}
            {adding && (
              <tr style={{ background: '#fafafa' }}>
                <td className="w-24 hidden sm:table-cell">
                  <input
                    type="number" value={newOrden}
                    onChange={e => setNewOrden(Number(e.target.value))}
                    className="w-16 border rounded-md px-2 py-1 text-sm text-center outline-none"
                    style={{ borderColor: 'var(--border)' }}
                  />
                </td>
                <td>
                  <input
                    value={newNombre} onChange={e => setNewNombre(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="Nombre del nuevo valor..."
                    className="border rounded-md px-2 py-1 text-sm outline-none w-48"
                    style={{ borderColor: 'var(--primary)' }}
                    autoFocus
                  />
                </td>
                {withComision && (
                  <td>
                    <input
                      type="number" min="0" step="0.01"
                      value={newComision}
                      onChange={e => setNewComision(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAdd()}
                      placeholder="Sin definir"
                      className="border rounded-md px-2 py-1 text-sm outline-none w-32"
                      style={{ borderColor: 'var(--primary)' }}
                    />
                  </td>
                )}
                <td />
                <td>
                  <div className="flex gap-1">
                    <button onClick={handleAdd} disabled={busy || !newNombre.trim()}
                      className="p-1.5 rounded-lg hover:bg-green-50 disabled:opacity-40 transition-colors"
                      title="Agregar">
                      <Check size={14} style={{ color: '#16a34a' }} />
                    </button>
                    <button onClick={() => { setAdding(false); setNewNombre('') }}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      title="Cancelar">
                      <X size={14} style={{ color: '#dc2626' }} />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        {!adding && (
          <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => { setAdding(true); setNewOrden(items.length + 1) }}
              className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: 'var(--primary)' }}
            >
              <Plus size={15} /> Agregar nuevo
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>
          {error}
        </p>
      )}
    </div>
  )
}

// ─── Negocio panel ────────────────────────────────────────────
const FIRMA_MAX_BYTES = 2 * 1024 * 1024 // 2MB: es una firma, no una foto

function NegocioPanel({ initialConfig }: { initialConfig: Configuracion | null }) {
  const [form, setForm] = useState({
    nombre_negocio: initialConfig?.nombre_negocio ?? '',
    nit:            initialConfig?.nit ?? '',
    telefono:       initialConfig?.telefono ?? '',
    email:          initialConfig?.email ?? '',
    direccion:      initialConfig?.direccion ?? '',
    ciudad:         initialConfig?.ciudad ?? '',
    mensaje_factura: initialConfig?.mensaje_factura ?? '',
    representante_legal_nombre:     initialConfig?.representante_legal_nombre ?? '',
    representante_legal_documento:  initialConfig?.representante_legal_documento ?? '',
  })
  const [firmaUrl, setFirmaUrl]   = useState(initialConfig?.representante_legal_firma_url ?? '')
  const [subiendoFirma, setSubiendoFirma] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleFirmaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo si falla
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('La firma debe ser una imagen (PNG o JPG)'); return }
    if (file.size > FIRMA_MAX_BYTES) { setError('La imagen de la firma no puede superar 2MB'); return }

    setError('')
    setSubiendoFirma(true)
    const supabase = createClient()
    // Ruta fija SIN extensión: lo que determina cómo se interpreta la imagen
    // es el Content-Type que mandamos explícito, no la extensión en la URL.
    // Si la ruta incluyera la extensión del archivo subido, cambiar de un
    // PNG a un JPG (o viceversa) crearía un segundo objeto en el bucket en
    // vez de reemplazar al anterior, dejando el viejo como basura residual.
    // Con una sola ruta fija, upsert siempre pisa el mismo objeto.
    const path = 'firma-representante-legal'
    const { error: upErr } = await supabase.storage
      .from('negocio')
      .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type })

    if (upErr) { setError(upErr.message); setSubiendoFirma(false); return }

    // Limpieza de transición: firmas subidas antes de este cambio quedaron
    // con extensión en el nombre (firma-representante-legal.png/.jpg). Se
    // borran una vez que ya existe el reemplazo en la ruta fija nueva, para
    // no dejarlas huérfanas en el bucket. No pasa nada si no existen.
    await supabase.storage.from('negocio').remove([
      'firma-representante-legal.png',
      'firma-representante-legal.jpg',
      'firma-representante-legal.jpeg',
    ])

    const { data } = supabase.storage.from('negocio').getPublicUrl(path)
    // Cache-bust: la URL pública es siempre la misma ruta, así que sin esto
    // el navegador seguiría mostrando la firma vieja tras reemplazarla.
    setFirmaUrl(`${data.publicUrl}?v=${Date.now()}`)
    setSubiendoFirma(false)
  }

  function handleQuitarFirma() {
    // Solo limpia el campo local: el archivo en Storage queda (no hay botón
    // de borrado destructivo acá), y se reemplaza solo si se sube uno nuevo.
    // Hay que confirmar con "Guardar cambios" para que se desvincule de verdad.
    setFirmaUrl('')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const supabase = createClient()
    const payload = {
      nombre_negocio:  form.nombre_negocio,
      nit:             form.nit || null,
      telefono:        form.telefono || null,
      email:           form.email || null,
      direccion:       form.direccion || null,
      ciudad:          form.ciudad || null,
      mensaje_factura: form.mensaje_factura || null,
      representante_legal_nombre:    form.representante_legal_nombre || null,
      representante_legal_documento: form.representante_legal_documento || null,
      representante_legal_firma_url: firmaUrl || null,
      updated_at:      new Date().toISOString(),
    }

    let err
    if (initialConfig?.id) {
      const res = await supabase.from('configuracion').update(payload).eq('id', initialConfig.id)
      err = res.error
    } else {
      const res = await supabase.from('configuracion').insert(payload)
      err = res.error
    }

    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const f = (label: string, key: keyof typeof form, opts?: { type?: string; placeholder?: string; required?: boolean }) => (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>{label}</label>
      <input
        type={opts?.type ?? 'text'}
        required={opts?.required}
        value={form[key]}
        onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
        placeholder={opts?.placeholder}
        className="input-field"
      />
    </div>
  )

  return (
    <form onSubmit={handleSave} className="max-w-lg space-y-4">
      {f('Nombre del negocio *', 'nombre_negocio', { required: true, placeholder: 'Café de mi Tierra' })}

      <div className="grid grid-cols-2 gap-3">
        {f('NIT / RUT', 'nit', { placeholder: '900.123.456-7' })}
        {f('Teléfono', 'telefono', { placeholder: '3001234567' })}
      </div>

      {f('Correo electrónico', 'email', { type: 'email', placeholder: 'contacto@cafemicierra.com' })}
      <div className="grid grid-cols-2 gap-3">
        {f('Dirección', 'direccion', { placeholder: 'Calle 1 # 2-3' })}
        {f('Ciudad', 'ciudad', { placeholder: 'El Peñol' })}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
          Mensaje de pie de factura
        </label>
        <textarea
          value={form.mensaje_factura}
          onChange={e => setForm(prev => ({ ...prev, mensaje_factura: e.target.value }))}
          placeholder="Gracias por su compra. ¡Vuelva pronto!"
          className="input-field resize-none" rows={2}
        />
      </div>

      <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>Representante legal</p>
        <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>
          Firma las cuentas de cobro que se emiten a clientes institucionales desde el módulo de Facturas.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {f('Nombre completo', 'representante_legal_nombre', { placeholder: 'Nombre y apellidos' })}
        {f('Cédula', 'representante_legal_documento', { placeholder: '1.234.567.890' })}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Firma</label>
        <div className="flex items-center gap-4 p-4 rounded-xl"
          style={{ border: '1.5px dashed var(--border)', background: 'var(--secondary)' }}>
          <div className="flex items-center justify-center shrink-0 rounded-lg overflow-hidden"
            style={{ width: 96, height: 64, background: '#fff', border: '1px solid var(--border)' }}>
            {firmaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- imagen subida por el usuario, no un asset del build
              <img src={firmaUrl} alt="Firma del representante legal" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <span className="text-xs text-center px-1" style={{ color: 'var(--muted-foreground)' }}>Sin firma</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <label className={`btn btn-secondary btn-sm ${subiendoFirma ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
                <Upload size={13} />
                {subiendoFirma ? 'Subiendo…' : firmaUrl ? 'Cambiar firma' : 'Subir firma'}
                <input
                  type="file" accept="image/png,image/jpeg"
                  onChange={handleFirmaChange} disabled={subiendoFirma}
                  className="sr-only"
                />
              </label>
              {firmaUrl && !subiendoFirma && (
                <button type="button" onClick={handleQuitarFirma} className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }}>
                  <Trash2 size={13} /> Quitar
                </button>
              )}
            </div>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>PNG o JPG, máximo 2MB. Fondo transparente se ve mejor en el PDF.</p>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{error}</p>
      )}

      <button
        type="submit" disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-60"
        style={{ background: saved ? '#16a34a' : 'var(--primary)', color: '#fff' }}
      >
        {saving ? 'Guardando...' : saved ? '✓ Cambios guardados' : 'Guardar cambios'}
      </button>

      <style>{`.input-field { width:100%; border-radius:0.5rem; border:1px solid var(--border); padding:0.5rem 0.75rem; font-size:0.875rem; background:var(--background); outline:none; }`}</style>
    </form>
  )
}

// ─── Main component ───────────────────────────────────────────
export function ConfiguracionClient({
  initialPresentations,
  initialTipos,
  initialMetodosPago,
  config,
}: {
  initialPresentations: Presentation[]
  initialTipos: TipoProducto[]
  initialMetodosPago: MetodoPago[]
  config: Configuracion | null
}) {
  const [tab, setTab] = useState<Tab>('presentaciones')

  return (
    <div className="page-wrapper">
      <div className="mb-6">
        <h1 className="page-title">Configuración</h1>
        <p className="page-subtitle">
          Datos maestros del sistema — solo visible para administradores
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl mb-6 w-fit" style={{ background: 'var(--secondary)' }}>
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={
                active
                  ? { background: '#fff', color: 'var(--foreground)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                  : { color: 'var(--muted-foreground)' }
              }
            >
              <Icon size={15} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'presentaciones' && (
        <LookupPanel
          initialItems={initialPresentations as LookupItem[]}
          tableName="presentations"
          activeKey="activa"
          description={TABS[0].desc}
          withComision
        />
      )}
      {tab === 'tipos' && (
        <LookupPanel
          initialItems={initialTipos as LookupItem[]}
          tableName="tipos_producto"
          activeKey="activo"
          description={TABS[1].desc}
        />
      )}
      {tab === 'metodos_pago' && (
        <MetodosPagoPanel initialItems={initialMetodosPago} />
      )}
      {tab === 'negocio' && (
        <NegocioPanel initialConfig={config} />
      )}
    </div>
  )
}
