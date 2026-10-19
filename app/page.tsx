import { redirect } from 'next/navigation'

// signed-out visitors are sent to /login by proxy.ts first
export default function Home() {
  redirect('/dashboard')
}
