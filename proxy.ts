import { NextResponse, type NextRequest } from 'next/server'

const PROJECT_REF = 'ggtmdtmkiabqfkehxtqc'

function hasValidSession(request: NextRequest): boolean {
  const cookies = request.cookies.getAll()
  return cookies.some(c => c.name.startsWith(`sb-${PROJECT_REF}-auth-token`))
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/auth') || pathname.startsWith('/api')
  const authenticated = hasValidSession(request)

  if (!authenticated && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (authenticated && pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
