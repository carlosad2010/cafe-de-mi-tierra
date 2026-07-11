'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Customer, DocumentType } from '@/lib/types'
import { Plus, Pencil, Users, Search } from 'lucide-react'

const DOC_TYPES: DocumentType[] = ['CC', 'NIT', 'CE', 'PPN', 'otro']

const EMPTY_FORM = {
  full_name: '', email: '', phone: '',
  document_type: 'CC' as DocumentType, document_number: '',
  address: '', city: '', contacto: '', telefono_contacto: '', notes: '', active: true,
}

export function CustomersClient({ initialCustomers }: { initialCustomers: Customer[] }) {
  const [customers, setCustomers] = useState(initialCustomers)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filtered = customers.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.document_number?.includes(search)
  )

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  function openEdit(c: Customer) {
    setEditing(c)
    setForm({
      full_name: c.full_name, email: c.email ?? '', phone: c.phone ?? '',
      document_type: c.document_type ?? 'CC', document_number: c.document_number ?? '',
      address: c.address ?? '', city: c.city ?? '',
      contacto: c.contacto ?? '', telefono_contacto: c.telefono_contacto ?? '',
      notes: c.notes ?? '', active: c.active,
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
      full_name: form.full_name,
      email: form.email || null,
      phone: form.phone || null,
      document_type: form.document_type,
      document_number: form.document_number || null,
      address: form.address || null,
      city: form.city || null,
      contacto: form.contacto || null,
      telefono_contacto: form.telefono_contacto || null,
      notes: form.notes || null,
      active: form.active,
    }

    if (editing) {
      const { error: err } = await supabase
        .from('customers').update(payload).eq('id', editing.id)
      if (err) { setError(err.message); setSaving(false); return }
      setCustomers(prev => prev.map(c => c.id === editing.id ? { ...c, ...payload } : c))
    } else {
      const { data, error: err } = await supabase
        .from('customers').insert(payload).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      setCustomers(prev => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)))
    }

    setShowModal(false)
    setSaving(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Clientes</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{customers.length} clientes registrados</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none"
          style={{ borderColor: 'var(--border)', background: '#fff' }}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto" style={{ background: '#fff', borderColor: 'var(--border)' }}>
        <table className="w-full text-sm" style={{ minWidth: '900px' }}>
          <thead>
            <tr style={{ background: 'var(--secondary)' }}>
              {['Nombre', 'Documento', 'Teléfono', 'Contacto', 'Tel. Contacto', 'Correo', 'Ciudad', 'Estado', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--foreground)' }}>{c.full_name}</td>
                <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>
                  {c.document_type && c.document_number ? `${c.document_type} ${c.document_number}` : '—'}
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{c.phone ?? '—'}</td>
                <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{c.contacto ?? '—'}</td>
                <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{c.telefono_contacto ?? '—'}</td>
                <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{c.email ?? '—'}</td>
                <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{c.city ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: c.active ? '#dcfce7' : '#fee2e2', color: c.active ? '#16a34a' : '#dc2626' }}>
                    {c.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    <Pencil size={14} style={{ color: 'var(--muted-foreground)' }} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <Users size={40} className="mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {search ? 'Sin resultados' : 'Sin clientes aún. Crea el primero.'}
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto" style={{ background: '#fff' }}>
            <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--foreground)' }}>
              {editing ? 'Editar cliente' : 'Nuevo cliente'}
            </h2>

            <form onSubmit={handleSave} className="space-y-4">
              <Field label="Nombre completo *">
                <input required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="input-field" placeholder="Carlos Andrés López" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo de documento">
                  <select value={form.document_type} onChange={e => setForm(f => ({ ...f, document_type: e.target.value as DocumentType }))} className="input-field">
                    {DOC_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
                <Field label="Número de documento">
                  <input value={form.document_number} onChange={e => setForm(f => ({ ...f, document_number: e.target.value }))}
                    className="input-field" placeholder="1234567890" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Teléfono / WhatsApp">
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="input-field" placeholder="3001234567" />
                </Field>
                <Field label="Correo electrónico">
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="input-field" placeholder="cliente@correo.com" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Ciudad">
                  <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    className="input-field" placeholder="Bogotá" />
                </Field>
                <Field label="Dirección">
                  <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    className="input-field" placeholder="Calle 1 # 2-3" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Contacto">
                  <input value={form.contacto} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))}
                    className="input-field" placeholder="Nombre del contacto" />
                </Field>
                <Field label="Teléfono del contacto">
                  <input value={form.telefono_contacto} onChange={e => setForm(f => ({ ...f, telefono_contacto: e.target.value }))}
                    className="input-field" placeholder="3001234567" />
                </Field>
              </div>

              <Field label="Notas (opcional)">
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
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
