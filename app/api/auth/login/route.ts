import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: NextRequest) {
  const successUrl = new URL('/dashboard', request.url)
  const errorUrl = new URL('/login', request.url)
  errorUrl.searchParams.set('error', '1')

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.redirect(errorUrl, { status: 303 })
  }
  const email = formData.get('email')
  const password = formData.get('password')
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return NextResponse.redirect(errorUrl, { status: 303 })
  }

  // Build the success response first so we can bind cookies to it
  const response = NextResponse.redirect(successUrl, { status: 303 })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Set cookies directly on the redirect response — same HTTP response
          // the browser receives, so no race condition between cookie storage
          // and navigation
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.redirect(errorUrl, { status: 303 })
  }

  return response
}
