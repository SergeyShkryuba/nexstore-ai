/**
 * Error reporting to Sentry, shared by the server (`src/instrumentation.ts`),
 * the browser (`src/instrumentation-client.ts`) and the error page.
 *
 * Off unless a DSN is configured: without one the SDK is never imported, so it
 * costs nothing in the browser bundle and sends nothing anywhere.
 *
 * What does get sent is scrubbed first. Sentry is a third party, and the
 * things this app handles that must not end up there are: session cookies,
 * Stripe session ids in URLs, and secrets that some error messages quote
 * (Stripe's "Invalid API Key provided: sk_test_…", Supabase JWTs).
 */

/** Client DSN; the server also accepts a server-only `SENTRY_DSN`. */
export const browserDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || ''

const SECRET_PATTERNS: RegExp[] = [
  // Stripe secret, restricted, publishable and webhook keys.
  /\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]+/g,
  /\bwhsec_[A-Za-z0-9]+/g,
  // JWTs: Supabase anon/service keys and access tokens.
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  // Stripe Checkout session ids (in success URLs).
  /\bcs_(?:test|live)_[A-Za-z0-9]+/g,
]

/** Replaces anything that looks like a key, token or session id. */
export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((out, pattern) => out.replace(pattern, '[redacted]'), text)
}

/** Drops the query string and fragment: they carry session ids and search terms. */
export function stripQuery(url: string): string {
  return redactSecrets(url.split(/[?#]/)[0])
}

/** Redacts every string inside a plain value; deeper than a few levels is dropped. */
function redactDeep(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return redactSecrets(value)
  if (value === null || typeof value !== 'object') return value
  if (depth >= 5) return '[truncated]'
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth + 1))
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v, depth + 1)]))
}

/** Headers worth keeping on a report; everything else (cookies, auth, IPs) goes. */
const KEPT_HEADERS = new Set(['user-agent'])

type ScrubbableEvent = {
  message?: string
  request?: {
    url?: string
    query_string?: unknown
    cookies?: unknown
    data?: unknown
    headers?: Record<string, string>
    env?: unknown
  }
  user?: { id?: string | number; [key: string]: unknown }
  extra?: { [key: string]: unknown }
  exception?: { values?: Array<{ value?: string }> }
  breadcrumbs?: ScrubbableBreadcrumb[]
}

type ScrubbableBreadcrumb = {
  message?: string
  data?: { [key: string]: unknown }
}

export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(breadcrumb: B): B {
  if (breadcrumb.message) breadcrumb.message = redactSecrets(breadcrumb.message)
  const data = breadcrumb.data
  if (data) {
    // fetch/xhr breadcrumbs carry `url`; navigation ones carry `from` and `to`.
    for (const key of ['url', 'from', 'to']) {
      if (typeof data[key] === 'string') data[key] = stripQuery(data[key] as string)
    }
  }
  return breadcrumb
}

/** `beforeSend`: runs on every event before it leaves the process or the page. */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  if (event.message) event.message = redactSecrets(event.message)

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactSecrets(exception.value)
  }

  const request = event.request
  if (request) {
    delete request.cookies
    delete request.data
    delete request.query_string
    delete request.env
    if (request.url) request.url = stripQuery(request.url)
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) => KEPT_HEADERS.has(name.toLowerCase())),
      )
    }
  }

  // An account id is enough to find the user in Supabase; email and IP stay out.
  if (event.user) event.user = event.user.id !== undefined ? { id: event.user.id } : {}

  // Captured console.error calls put their arguments here — often a Supabase
  // or Stripe error object whose text can quote what it was given.
  if (event.extra) event.extra = redactDeep(event.extra, 0) as typeof event.extra

  event.breadcrumbs?.forEach(scrubBreadcrumb)
  return event
}

/** Options common to every runtime. */
export function sentryOptions(dsn: string) {
  return {
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    // No IPs, cookies or request bodies attached by the SDK itself.
    sendDefaultPii: false,
    // Errors only; no performance tracing.
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  }
}

/**
 * Reports an error caught by an error boundary (React swallows those, so the
 * SDK's global handlers never see them). No-op without a DSN.
 */
export function reportClientError(error: unknown): void {
  if (!browserDsn) return
  import('@sentry/nextjs')
    .then((Sentry) => Sentry.captureException(error))
    .catch(() => {
      // Reporting must never be the thing that breaks the error page.
    })
}
