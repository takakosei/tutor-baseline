'use client'

import { useFormStatus } from 'react-dom'

// A submit button styled as a checkbox. While submitting it shows the toggled state; the server response then takes over.
export function CheckButton({ done, label }: { done: boolean; label: string }) {
  const { pending } = useFormStatus()
  const shown = pending ? !done : done

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      aria-pressed={done}
      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
        shown ? 'border-foreground bg-foreground text-background' : 'border-foreground/30 hover:border-foreground/60'
      } ${pending ? 'opacity-50' : ''}`}
    >
      {shown && (
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}
