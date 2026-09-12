import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { Role } from '@/lib/types'

const VALID_ROLES: Role[] = ['admin', 'seller', 'consulta']

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Solo administradores' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 })
  }
  const { email, full_name, password, role } = (body ?? {}) as Record<string, unknown>

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Correo inválido' }, { status: 400 })
  }
  if (typeof full_name !== 'string' || full_name.trim().length === 0) {
    return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }
  if (typeof role !== 'string' || !VALID_ROLES.includes(role as Role)) {
    return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: newUser, error } = await admin.auth.admin.createUser({
    email,
    password,
    user_metadata: { full_name, role },
    email_confirm: true,
  })

  if (error || !newUser?.user) {
    return NextResponse.json({ error: error?.message ?? 'No se pudo crear el usuario' }, { status: 400 })
  }

  const { data: newProfile } = await admin
    .from('profiles').select('*').eq('id', newUser.user.id).single()

  return NextResponse.json({ profile: newProfile })
}
