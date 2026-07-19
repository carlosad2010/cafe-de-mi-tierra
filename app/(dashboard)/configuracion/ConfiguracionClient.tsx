'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Presentation, TipoProducto, Configuracion, MetodoPago } from '@/lib/types'
import { Plus, Pencil, Check, X, Coffee, Package, Building2, CreditCard } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type LookupItem = {
  id: string
  nombre: string
  orden: number
  created_at: string
  activa?: boolean
  activo?: boolean
}

type Tab = 'presentaciones' | 'tipos' | 'metodos_pago' | 'negocio'

const TABS: { id: Tab; label: string; icon: React.ElementType; desc: string }[] = [
  {
    id: 'presentaciones',
    label: 'Presentaciones',
    icon: Package,
    desc: 'Formatos disponibles para los productos (ej: 45g, 250g, 500g, 1kg).',
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
    desc: 'Medios de pago aceptados — aparecen en el módulo de Ventas y al crear cajas.',
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
        Métodos de pago aceptados — aparecen en el módulo de Ventas y al crear cajas.
      </p>

      <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--secondary)' }}>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Nombre</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Tipo</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>Orden</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {items.map(item => {
                const isEd = editing === item.id
                return (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--foreground)' }}>
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
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 hidden sm:table-cell">
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
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(item)}
                        className="text-xs px-2 py-0.5 rounded-full font-medium transition-colors"
                        style={{ background: item.activo ? '#dcfce7' : '#fee2e2', color: item.activo ? '#16a34a' : '#dc2626' }}
                      >
                        {item.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
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
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
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
                  <td className="px-4 py-3">
                    <input
                      value={newNombre} onChange={e => setNewNombre(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAdd()}
                      placeholder="ej: PSE, Efecty..."
                      className="border rounded-md px-2 py-1 text-sm outline-none w-36"
                      style={{ borderColor: 'var(--primary)' }}
                      autoFocus
                    />
                  </td>
                  <td className="px-4 py-3">
                    {tipoSelect(newTipo, setNewTipo, 'w-28')}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <input type="number" value={newOrden}
                      onChange={e => setNewOrden(Number(e.target.value))}
                      className="w-16 border rounded-md px-2 py-1 text-sm text-center outline-none"
                      style={{ borderColor: 'var(--border)' }}
                    />
                  </td>
                  <td />
                  <td className="px-4 py-3">
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
}: {
  initialItems: LookupItem[]
  tableName: string
  activeKey: 'activa' | 'activo'
  description: string
}) {
  const [items, setItems] = useState([...initialItems].sort((a, b) => a.orden - b.orden))
  const [editing, setEditing] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editOrden, setEditOrden] = useState(0)
  const [adding, setAdding] = useState(false)
  const [newNombre, setNewNombre] = useState('')
  const [newOrden, setNewOrden] = useState(initialItems.length + 1)
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
    setError('')
  }

  async function saveEdit(id: string) {
    if (!editNombre.trim()) return
    setBusy(true)
    setError('')
    const supabase = createClient()
    const { error: err } = await supabase
      .from(tableName)
      .update({ nombre: editNombre.trim(), orden: editOrden })
      .eq('id', id)
    if (err) { setError(err.message); setBusy(false); return }
    setItems(prev =>
      prev.map(i => i.id === id ? { ...i, nombre: editNombre.trim(), orden: editOrden } : i)
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
    const { data, error: err } = await supabase.from(tableName).insert(row).select().single()
    if (err) { setError(err.message); setBusy(false); return }
    setItems(prev => [...prev, data as LookupItem].sort((a, b) => a.orden - b.orden))
    setAdding(false)
    setNewNombre('')
    setNewOrden(items.length + 2)
    setBusy(false)
  }

  return (
    <div className="max-w-2xl">
      <p className="text-sm mb-5" style={{ color: 'var(--muted-foreground)' }}>{description}</p>

      <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--secondary)' }}>
              <th className="px-4 py-3 text-left font-medium hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>Orden</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Nombre</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>Estado</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}></th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {items.map(item => {
              const isEd = editing === item.id
              const active = isActive(item)
              return (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 w-24 hidden sm:table-cell">
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
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--foreground)' }}>
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
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(item)}
                      className="text-xs px-2 py-0.5 rounded-full font-medium transition-colors"
                      style={{ background: active ? '#dcfce7' : '#fee2e2', color: active ? '#16a34a' : '#dc2626' }}
                    >
                      {active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
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
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
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
                <td className="px-4 py-3 w-24 hidden sm:table-cell">
                  <input
                    type="number" value={newOrden}
                    onChange={e => setNewOrden(Number(e.target.value))}
                    className="w-16 border rounded-md px-2 py-1 text-sm text-center outline-none"
                    style={{ borderColor: 'var(--border)' }}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    value={newNombre} onChange={e => setNewNombre(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="Nombre del nuevo valor..."
                    className="border rounded-md px-2 py-1 text-sm outline-none w-48"
                    style={{ borderColor: 'var(--primary)' }}
                    autoFocus
                  />
                </td>
                <td />
                <td className="px-4 py-3">
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
function NegocioPanel({ initialConfig }: { initialConfig: Configuracion | null }) {
  const [form, setForm] = useState({
    nombre_negocio: initialConfig?.nombre_negocio ?? '',
    nit:            initialConfig?.nit ?? '',
    telefono:       initialConfig?.telefono ?? '',
    email:          initialConfig?.email ?? '',
    direccion:      initialConfig?.direccion ?? '',
    mensaje_factura: initialConfig?.mensaje_factura ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

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
      mensaje_factura: form.mensaje_factura || null,
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
      {f('Dirección', 'direccion', { placeholder: 'Calle 1 # 2-3, Bogotá' })}

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
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Configuración</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
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
