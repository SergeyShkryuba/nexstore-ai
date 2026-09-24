import type { Metadata } from 'next'
import Link from 'next/link'
import { LinkIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Link expired',
  robots: { index: false },
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string }>
}) {
  const { flow } = await searchParams
  const recovery = flow === 'recovery'

  return (
    <div className="container mx-auto px-4 py-24">
      <div className="mx-auto max-w-md text-center">
        <LinkIcon className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-6 text-3xl font-bold tracking-tight">This link no longer works</h1>
        <p className="mt-4 text-muted-foreground">
          Email links expire after an hour and work only once. Links from the default emails also
          have to be opened in the same browser you requested them from.
        </p>
        <p className="mt-4 text-muted-foreground">
          {recovery
            ? 'Ask for a new one: open Sign In and choose “Forgot password?”.'
            : 'If you were confirming your email, it may already be confirmed — try signing in.'}
        </p>
        <Link href="/" className={buttonVariants({ className: 'mt-8' })}>
          Back to the store
        </Link>
      </div>
    </div>
  )
}
