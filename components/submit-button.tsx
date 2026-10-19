'use client'

import { useFormStatus } from 'react-dom'

// Disabled while submitting to prevent double submits (sign-in emails are rate-limited, so duplicates waste the quota)
export function SubmitButton({
  children,
  pendingText,
  small = false,
  secondary = false,
  className = '',
}: {
  children: React.ReactNode
  pendingText: string
  small?: boolean
  secondary?: boolean
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-md font-medium transition-opacity disabled:opacity-50 ${
        secondary ? 'border border-foreground/20 hover:bg-foreground/[0.04]' : 'bg-foreground text-background'
      } ${small ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm'} ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  )
}
