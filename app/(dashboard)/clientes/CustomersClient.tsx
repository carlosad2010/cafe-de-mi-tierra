'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Customer, DocumentType } from '@/lib/types'
import { Plus, Pencil, Users } from 'lucide-react'
import { useEscKey } from '@/lib/hooks/useEscKey'
import { EmptyState } from '@/components/ui/EmptyState'
import { SearchField } from '@/components/ui/SearchField'

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

  useEscKey(() => setShowModal(false))

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
    <div className="page-wrapper">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">{customers.length} clientes registrados</p>
        </div>
        <button onClick={openCreate}
          className="btn btn-primary">
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      {/* Search */}
      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Buscar por nombre, documento, teléfono o correo…"
        className="mb-4 max-w-sm"
      />

      {/* Table */}
      <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
        <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th className="hidden sm:table-cell">Documento</th>
              <th>Teléfono</th>
              <th className="hidden sm:table-cell">Contacto</th>
              <th className="hidden sm:table-cell">Tel. Contacto</th>
              <th className="hidden sm:table-cell">Correo</th>
              <th className="hidden sm:table-cell">Ciudad</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id}>
                <td className="font-medium" style={{ color: 'var(--foreground)' }}>{c.full_name}</td>
                <td className="hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>
                  {c.document_type && c.document_number ? `${c.document_type} ${c.document_number}` : '—'}
                </td>
                <td style={{ color: 'var(--muted-foreground)' }}>{c.phone ?? '—'}</td>
                <td className="hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{c.contacto ?? '—'}</td>
                <td className="hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{c.telefono_contacto ?? '—'}</td>
                <td className="hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{c.email ?? '—'}</td>
                <td className="hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{c.city ?? '—'}</td>
                <td>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: c.active ? '#dcfce7' : '#fee2e2', color: c.active ? '#16a34a' : '#dc2626' }}>
                    {c.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>
                  <button onClick={() => openEdit(c)} className="btn-icon">
                    <Pencil size={14} style={{ color: 'var(--muted-foreground)' }} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState
            icon={Users}
            title={search ? 'Sin resultados' : 'Aún no hay clientes'}
            description={search
              ? `Ningún cliente coincide con «${search}».`
              : 'Registra tu primer cliente para empezar a facturar.'}
            action={!search && (
              <button onClick={openCreate} className="btn btn-primary btn-sm">
                <Plus size={14} /> Nuevo cliente
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
                  className="btn btn-secondary flex-1">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="btn btn-primary flex-1">
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
