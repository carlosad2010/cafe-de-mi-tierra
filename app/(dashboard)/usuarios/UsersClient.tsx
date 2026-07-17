'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { Plus, UserCog } from 'lucide-react'

export function UsersClient({ initialProfiles }: { initialProfiles: Profile[] }) {
  const [profiles, setProfiles] = useState(initialProfiles)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ email: '', full_name: '', password: '', role: 'seller' as 'admin' | 'seller' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <Plus size={16} /> Nuevo usuario
        </button>
      </div>

      <div className="rounded-xl border" style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}>
        <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: '600px' }}>
          <thead>
            <tr style={{ background: 'var(--secondary)' }}>
              {['Nombre', 'Correo', 'Rol', 'Estado', 'Creado', 'Acción'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {profiles.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--foreground)' }}>{p.full_name}</td>
                <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{p.email}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                    style={{ background: p.role === 'admin' ? '#fef3c7' : 'var(--secondary)', color: p.role === 'admin' ? '#92400e' : 'var(--muted-foreground)' }}>
                    {p.role === 'admin' ? 'Administrador' : 'Vendedor'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(p)}
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: p.active ? '#dcfce7' : '#fee2e2', color: p.active ? '#16a34a' : '#dc2626' }}>
                    {p.active ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{formatDate(p.created_at)}</td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
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
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-xl" style={{ background: '#fff' }}>
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
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
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
