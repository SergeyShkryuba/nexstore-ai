import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { LinkIcon } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { isLocale } from '@/i18n/routing'
import { buttonVariants } from '@/components/ui/button'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ flow?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'AuthError' })
  return { title: t('metaTitle'), robots: { index: false } }
}

export default async function AuthErrorPage({ params, searchParams }: Props) {
  const [{ locale }, { flow }] = await Promise.all([params, searchParams])
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations('AuthError')
  const recovery = flow === 'recovery'

  return (
    <div className="container mx-auto px-4 py-24">
      <div className="mx-auto max-w-md text-center">
        <LinkIcon className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-6 text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-4 text-muted-foreground">{t('expired')}</p>
        <p className="mt-4 text-muted-foreground">{recovery ? t('recovery') : t('confirm')}</p>
        <Link href="/" className={buttonVariants({ className: 'mt-8' })}>
          {t('back')}
        </Link>
      </div>
    </div>
  )
}
