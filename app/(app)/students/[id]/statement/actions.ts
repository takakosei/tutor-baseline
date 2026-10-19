'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { dateOrNull, requiredText } from '@/lib/form'

// "Other" items on the monthly tuition statement (textbooks bought for the student, discounts, etc.): add / delete one.
// Goes through RLS, so only the teacher's own students are reachable

function back(studentId: string, month: string): never {
  revalidatePath(`/students/${studentId}/statement`)
  redirect(`/students/${studentId}/statement${/^\d{4}-\d{2}$/.test(month) ? `?month=${month}` : ''}`)
}

// The date is optional: the item counts toward month (the month being viewed when adding); a given date must fall in that month
export async function addStatementItem(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const month = String(formData.get('month') ?? '')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month')
  const date = dateOrNull(formData, 'date')
  if (date && date.slice(0, 7) !== month) throw new Error('Date is not in this month')
  const yen = Number(formData.get('amount'))
  if (!Number.isInteger(yen) || yen <= 0) throw new Error('Amount must be a positive whole number (yen)')
  const sign = formData.get('sign') === '-' ? -1 : 1 // minus: discounts, deductions, etc.

  const supabase = await createClient()
  const { error } = await supabase
    .from('statement_items')
    .insert({ student_id: studentId, month, date, label: requiredText(formData, 'label'), amount: sign * yen })
  if (error) throw error
  back(studentId, month)
}

export async function deleteStatementItem(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('statement_items')
    .delete()
    .eq('id', String(formData.get('id') ?? ''))
    .select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Item not found or not allowed to delete')
  back(studentId, String(formData.get('month') ?? ''))
}

// "Show to parent": this month's statement appears on the parent page. Clicking again (already shown) is not an error
// and doesn't change the date
export async function publishStatement(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const month = String(formData.get('month') ?? '')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month')
  const supabase = await createClient()
  const { error } = await supabase
    .from('statement_months')
    .upsert({ student_id: studentId, month }, { onConflict: 'student_id,month', ignoreDuplicates: true })
  if (error) throw error
  back(studentId, month)
}

// Withdraw: the parent page stops showing this month's statement
export async function unpublishStatement(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const month = String(formData.get('month') ?? '')
  const supabase = await createClient()
  const { error } = await supabase.from('statement_months').delete().eq('student_id', studentId).eq('month', month)
  if (error) throw error
  back(studentId, month)
}
