import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Mail, Package, RotateCcw } from 'lucide-react'
import { SupportForm } from '@/components/support/SupportForm'
import { Link } from '@/i18n/navigation'
import { isLocale } from '@/i18n/routing'
import { alternates } from '@/lib/seo'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'Contact' })
  return { title: t('title'), description: t('metaDescription'), alternates: alternates('/contact', locale) }
}

/** Contact the store team: the same requests as the assistant's form, without the assistant. */
export default async function ContactPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations('Contact')

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mx-auto grid max-w-4xl gap-12 md:grid-cols-[1fr_16rem]">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-4 text-lg text-muted-foreground">{t('intro')}</p>
          <div className="mt-8">
            <SupportForm />
          </div>
        </div>

        <aside className="space-y-6 text-sm md:pt-16">
          <div className="flex gap-3">
            <Package className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-muted-foreground">
              {t.rich('orderHint', {
                link: (chunks) => (
                  <Link href="/profile" className="text-foreground underline underline-offset-4">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
          <div className="flex gap-3">
            <RotateCcw className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-muted-foreground">
              {t.rich('returnsHint', {
                link: (chunks) => (
                  <Link href="/help/shipping-returns" className="text-foreground underline underline-offset-4">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
          <div className="flex gap-3">
            <Mail className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-muted-foreground">{t('replyNote')}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
