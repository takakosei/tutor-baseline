// Helpers for reading FormData in Server Actions. Empty strings always become null, so "not filled in" has
// a single representation in the database and the parent page can safely show a field only when it's non-null.

export function text(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? '').trim()
  return value === '' ? null : value
}

export function requiredText(formData: FormData, key: string): string {
  const value = text(formData, key)
  if (value === null) throw new Error(`${key} is required`)
  return value
}

export function dateOrNull(formData: FormData, key: string): string | null {
  const value = text(formData, key)
  if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${key} is not a valid date`)
  return value
}

export function numberOrNull(
  formData: FormData,
  key: string,
  { integer = false }: { integer?: boolean } = {}
): number | null {
  const value = text(formData, key)
  if (value === null) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) {
    throw new Error(`${key} is not a valid number`)
  }
  return n
}

export function oneOf<T extends string>(formData: FormData, key: string, allowed: readonly T[]): T {
  const value = String(formData.get(key) ?? '')
  if (!allowed.includes(value as T)) throw new Error(`${key} has an invalid value`)
  return value as T
}
