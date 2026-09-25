import type { Instrumentation } from 'next'
import { browserDsn, sentryOptions } from '@/lib/sentry'

/**
 * Server-side error reporting (see `src/lib/sentry.ts`). Without a DSN nothing
 * is imported or initialised.
 */
const dsn = process.env.SENTRY_DSN || browserDsn

export async function register() {
  if (!dsn) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.init({
    ...sentryOptions(dsn),
    // Most server failures are caught and logged with console.error (so the
    // shopper gets a clean message) and would otherwise never reach Sentry.
    // An Error already sent by onRequestError is not sent a second time.
    integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
  })
}

/** Errors Next.js did not handle: render, route handler, server action, proxy. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!dsn) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(error, request, context)
}
