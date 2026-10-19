import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Every request passes through here first: refresh the Supabase session (an expired access token is renewed and written
// back to the cookie), then do an optimistic sign-in check. Real data protection is RLS; this only sends signed-out
// visitors to /login.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          // the new token must be visible to this render (request) and written back to the browser (response)
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
          // a response carrying a session must not be cached by a CDN, or one person's token could be served to another
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    }
  )

  // getClaims verifies the JWT signature; an expired token also triggers a refresh (→ setAll above)
  const { data } = await supabase.auth.getClaims()
  const loggedIn = Boolean(data?.claims)
  const { pathname } = request.nextUrl

  // /demo/ only uses fictional in-memory data (for the portfolio) and needs no sign-in
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/auth/') || pathname.startsWith('/demo/')
  if (!loggedIn && !isPublic) {
    return redirectKeepingCookies(request, '/login', response)
  }
  if (loggedIn && pathname.startsWith('/login')) {
    return redirectKeepingCookies(request, '/dashboard', response)
  }
  return response
}

// A redirect must carry over the cookies setAll wrote to the response (and the no-cache headers), or the refreshed session is lost
function redirectKeepingCookies(request: NextRequest, pathname: string, from: NextResponse) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  const redirect = NextResponse.redirect(url)
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  for (const key of ['cache-control', 'expires', 'pragma']) {
    const value = from.headers.get(key)
    if (value) redirect.headers.set(key, value)
  }
  return redirect
}

export const config = {
  matcher: [
    // static assets need no session; /p/ is the parent side, with no sign-in and no Supabase Auth
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|p/).*)',
  ],
}
