import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { UpdatePasswordForm } from '@/components/auth/UpdatePasswordForm'
import { createClient } from '@/utils/supabase/server'

export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false },
}

export default async function UpdatePasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mx-auto max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight">Set a new password</h1>
        {user ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">For {user.email}</p>
            <Card className="mt-6">
              <CardContent className="p-6">
                <UpdatePasswordForm />
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* Reached without the session a reset link creates. */}
            <p className="mt-4 text-muted-foreground">
              Open this page from the link in your password-reset email. To get one, open Sign In
              and choose &ldquo;Forgot password?&rdquo;.
            </p>
            <Link href="/" className={buttonVariants({ className: 'mt-6' })}>
              Back to the store
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
