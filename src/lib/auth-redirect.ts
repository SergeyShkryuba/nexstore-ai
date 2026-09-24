/**
 * Where to send someone after an email link signs them in.
 *
 * `next` arrives in a URL anyone can craft, so only same-site paths are
 * accepted. "//evil.com" and "/\evil.com" are protocol-relative to a browser
 * and would leave the site; anything like that falls back to `fallback`.
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  try {
    // Resolve against a throwaway origin: if it stays on that origin, it is a path.
    const url = new URL(raw, 'https://nexstore.invalid')
    if (url.origin !== 'https://nexstore.invalid') return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

/** Where email links land; `next` is where the callback forwards to afterwards. */
export function authCallbackUrl(origin: string, next: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`
}

export const UPDATE_PASSWORD_PATH = '/account/update-password'

/** Supabase's own minimum is 6; 8 is the floor worth enforcing. */
export const MIN_PASSWORD_LENGTH = 8
