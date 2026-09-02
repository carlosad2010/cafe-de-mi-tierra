'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { Plus, UserCog } from 'lucide-react'
import { useEscKey } from '@/lib/hooks/useEscKey'

export function UsersClient({ initialProfiles }: { initialProfiles: Profile[] }) {
  const [profiles, setProfiles] = useState(initialProfiles)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ email: '', full_name: '', password: '', role: 'seller' as 'admin' | 'seller' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEscKey(() => setShowModal(false))

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const res = await fetch('/api/users/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Error al crear usuario'); setSaving(false); return }

    setProfiles(prev => [...prev, data.profile].sort((a, b) => a.full_name.localeCompare(b.full_name)))
    setShowModal(false)
    setForm({ email: '', full_name: '', password: '', role: 'seller' })
    setSaving(false)
  }

  async function toggleActive(p: Profile) {
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles').update({ active: !p.active }).eq('id', p.id)
    if (!error) setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, active: !x.active } : x))
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Usuarios</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{profiles.length} usuarios registrados</p>
        </div>
        <button onClick={() => { setForm({ email: '', full_name: '', password: '', role: 'seller' }); setError(''); setShowModal(true) }}
          className="btn btn-primary">
          <Plus size={16} /> Nuevo usuario
        </button>
      </div>

      <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
        <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th className="hidden sm:table-cell">Creado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id}>
                <td className="font-medium" style={{ color: 'var(--foreground)' }}>{p.full_name}</td>
                <td style={{ color: 'var(--muted-foreground)' }}>{p.email}</td>
                <td>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                    style={{ background: p.role === 'admin' ? '#fef3c7' : 'var(--secondary)', color: p.role === 'admin' ? '#92400e' : 'var(--muted-foreground)' }}>
                    {p.role === 'admin' ? 'Administrador' : 'Vendedor'}
                  </span>
                </td>
                <td>
                  <button onClick={() => toggleActive(p)}
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: p.active ? '#dcfce7' : '#fee2e2', color: p.active ? '#16a34a' : '#dc2626' }}>
                    {p.active ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="text-xs hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>{formatDate(p.created_at)}</td>
                <td className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {p.active ? 'Desactivar' : 'Activar'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {profiles.length === 0 && (
          <div className="py-16 text-center">
            <UserCog size={40} className="mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Sin usuarios registrados</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '28rem' }}>
            <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--foreground)' }}>Nuevo usuario</h2>

            <form onSubmit={handleCreate} className="space-y-4">
              <Field label="Nombre completo *">
                <input required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="input-field" placeholder="María García" />
              </Field>
              <Field label="Correo electrónico *">
                <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="input-field" placeholder="maria@cafemicierra.com" />
              </Field>
              <Field label="Contraseña *">
                <input type="password" required minLength={8} value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="input-field" placeholder="Mínimo 8 caracteres" />
              </Field>
              <Field label="Rol">
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as any }))} className="input-field">
                  <option value="seller">Vendedor</option>
                  <option value="admin">Administrador</option>
                </select>
              </Field>

              {error && <p className="text-sm p-3 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{error}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="btn btn-secondary flex-1">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="btn btn-primary flex-1">
                  {saving ? 'Creando...' : 'Crear usuario'}
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
