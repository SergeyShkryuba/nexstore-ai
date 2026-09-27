/**
 * An error as it may be logged: its name, code and message, nothing else.
 * Postgres puts the failing row in `details` ("Failing row contains (…)"),
 * which for a support request or a review means an email address and a
 * message; logs should not hold those.
 */
export function loggable(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { name?: unknown; code?: unknown; message?: unknown }
    const parts = [e.name, e.code, e.message].filter((p): p is string => typeof p === 'string' && p !== '')
    if (parts.length > 0) return parts.join(': ')
  }
  return String(error)
}
