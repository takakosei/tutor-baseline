import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// The link in the sign-in email lands here; it is exchanged for a session cookie and then goes to /dashboard.
// Both link types are accepted:
// - token_hash: the email template {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email (needs custom SMTP).
//   It signs in whichever browser opens it, including the in-app browser of a phone mail app
// - code: Supabase's default template (PKCE). Must be opened in the same browser that made the request; kept so sign-in
//   still works if the template is reset to the default
// After sign-in it always goes to /dashboard; no ?next= style parameter is accepted, so it can't become an open redirect
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const tokenHash = params.get('token_hash')
  const type = params.get('type')
  const code = params.get('code')
  const supabase = await createClient()

  let ok = false
  if (tokenHash && (type === 'email' || type === 'magiclink')) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    ok = !error
    if (error) console.error('verifyOtp failed', error.code, error.message)
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    ok = !error
    if (error) console.error('exchangeCodeForSession failed', error.code, error.message)
  }

  redirect(ok ? '/dashboard' : '/login?error=link')
}
