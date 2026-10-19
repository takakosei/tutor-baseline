'use server'

import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { createRequest, withdrawRequest, type RequestKind } from '@/lib/parent-data'
import { requestMail } from '@/lib/booking'
import { notifyTeacher } from '@/lib/notify'
import { toTokyoDate } from '@/lib/progress'

// Requests from the parent page: extra lesson / leave / withdraw. These functions are public endpoints (anyone can POST
// to them directly), so nothing in the form is trusted: the token decides the student, and lib/parent-data.ts recomputes
// on the server whether the request is allowed

const TOKEN = /^[A-Za-z0-9_-]{43}$/

// Return to the parent page, with the result shown in the "Extra lesson · Leave" section. A wrong token goes to the home page
// (the parent page would 404 anyway)
function back(token: string, result: string): never {
  if (!TOKEN.test(token)) redirect('/')
  redirect(`/p/${token}?request=${result}#requests`)
}

function kindOf(formData: FormData): RequestKind {
  return formData.get('kind') === 'leave' ? 'leave' : 'add'
}

// the chosen lesson: 'YYYY-MM-DD HH:MM'
function slotOf(formData: FormData): { date: string; start: string } {
  const [date = '', start = ''] = String(formData.get('slot') ?? '').split(' ')
  return { date, start }
}

export async function sendRequest(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  const kind = kindOf(formData)
  const result = await createRequest(token, toTokyoDate(new Date()), {
    kind,
    ...slotOf(formData),
    message: String(formData.get('message') ?? ''),
  })
  if (!result.ok) back(token, result.code)
  const notice = result.notice
  if (notice) {
    // send the email after responding to the parent, so a slow Gmail never makes the parent wait
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
    after(() => notifyTeacher(requestMail({ ...notice, dashboardUrl: host ? `https://${host}/dashboard` : null })))
  }
  back(token, kind === 'add' ? 'sent-add' : 'sent-leave')
}

export async function cancelRequest(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  await withdrawRequest(token, {
    kind: kindOf(formData),
    date: String(formData.get('date') ?? ''),
    start: String(formData.get('start') ?? ''),
  })
  back(token, 'withdrawn')
}
