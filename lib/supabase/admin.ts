import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// service_role: bypasses RLS. Server only: the 'server-only' import above makes any client-side import fail at build time.
// Used only by the parent page (lib/parent-data.ts), and the schema grants this role only the columns the parent page
// needs (column-level select, plus narrow insert / update on lesson_requests and lessons).
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
