import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/dashboard'
  // Sólo se acepta una ruta relativa propia. `${origin}${next}` con un
  // next como "@evil.com" o ".evil.com" cambia el host resultante — un
  // open redirect. "//evil.com" también se descarta aunque el navegador
  // lo resuelva como ruta propia, para no depender de ese detalle.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
