import { browserDsn, sentryOptions } from '@/lib/sentry'

// Browser error reporting (see `src/lib/sentry.ts`). The SDK is a separate
// chunk, fetched only when a DSN is configured.
if (browserDsn) {
  import('@sentry/nextjs')
    .then((Sentry) => Sentry.init(sentryOptions(browserDsn)))
    .catch(() => {
      // An ad blocker or a failed chunk load must not break the page.
    })
}
