'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Order of the student cards (the dashboard's "Sort"): ids are in the new order, and each position is stored as students.sort_order.
// This is a public endpoint: it only accepts distinct student ids, and RLS decides which students can be changed (not other teachers')
export async function reorderStudents(ids: string[]) {
  if (
    !Array.isArray(ids) ||
    ids.length > 200 ||
    !ids.every((id) => typeof id === 'string' && UUID.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error('Invalid order')
  }
  const supabase = await createClient()
  const results = await Promise.all(ids.map((id, i) => supabase.from('students').update({ sort_order: i }).eq('id', id)))
  for (const r of results) if (r.error) throw r.error
  revalidatePath('/dashboard')
}
