'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { reportClientError } from '@/lib/sentry'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('Error')

  useEffect(() => {
    console.error('Unhandled application error:', error)
    // Error boundaries swallow the error, so the SDK's global handlers never
    // see it. No-op unless Sentry is configured.
    reportClientError(error)
  }, [error])

  return (
    <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive" aria-hidden="true" />
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="max-w-md text-muted-foreground">{t('description')}</p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">{t('reference', { digest: error.digest })}</p>
      )}
      <Button onClick={reset}>{t('retry')}</Button>
    </div>
  )
}
