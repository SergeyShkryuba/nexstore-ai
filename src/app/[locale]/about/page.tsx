import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { InfoPage, infoPageMetadata } from '@/components/layout/InfoPage'
import { LOCALES, isLocale } from '@/i18n/routing'
import { store } from '@/config/store'

type Props = { params: Promise<{ locale: string }> }

// The page is about the portfolio project: a real shop (demo mode off) has
// none, so the route is not built and every language of it is a 404.
export const dynamicParams = false
export function generateStaticParams() {
  return store.demo ? LOCALES.map((locale) => ({ locale })) : []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  return isLocale(locale) && store.demo ? infoPageMetadata('about', locale) : {}
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale) || !store.demo) notFound()
  setRequestLocale(locale)
  return <InfoPage page="about" locale={locale} href={store.sourceUrl ?? undefined} />
}
