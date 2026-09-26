import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { isLocale } from '@/i18n/routing'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { UpdatePasswordForm } from '@/components/auth/UpdatePasswordForm'
import { createClient } from '@/utils/supabase/server'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'UpdatePassword' })
  return { title: t('title'), robots: { index: false } }
}

export default async function UpdatePasswordPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations('UpdatePassword')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mx-auto max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        {user ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">{t('for', { email: user.email ?? '' })}</p>
            <Card className="mt-6">
              <CardContent className="p-6">
                <UpdatePasswordForm />
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* Reached without the session a reset link creates. */}
            <p className="mt-4 text-muted-foreground">{t('noSession')}</p>
            <Link href="/" className={buttonVariants({ className: 'mt-6' })}>
              {t('back')}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
