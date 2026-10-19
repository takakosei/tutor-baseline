import 'server-only'

import nodemailer from 'nodemailer'

// Emails the teacher when a parent sends an extra-lesson or leave request, from the teacher's own Gmail to itself:
//   GMAIL_USER         Gmail address
//   GMAIL_APP_PASSWORD an app password generated in the Google account
// Both are environment variables on the host, never in the repo. If they're unset no mail is sent (one line in the
// server log); the request still succeeds and shows up in the dashboard's to-do list.
// A failed send is only logged too: the notification is a convenience and must never make a parent's request fail
export async function notifyTeacher(mail: { subject: string; text: string; fromName: string }): Promise<void> {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) {
    console.warn('[notify] GMAIL_USER / GMAIL_APP_PASSWORD not set; no email sent')
    return
  }
  try {
    await nodemailer.createTransport({ service: 'gmail', auth: { user, pass } }).sendMail({
      from: { name: mail.fromName, address: user },
      to: user,
      subject: mail.subject,
      text: mail.text,
    })
  } catch (e) {
    console.error('[notify] sending email failed', e)
  }
}
