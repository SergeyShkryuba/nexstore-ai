import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { InfoPage, infoPageMetadata } from '@/components/layout/InfoPage'
import { isLocale } from '@/i18n/routing'

const REPO_URL = 'https://github.com/SergeyShkryuba/nexstore-ai'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  return isLocale(locale) ? infoPageMetadata('about', locale) : {}
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  return <InfoPage page="about" locale={locale} href={REPO_URL} />
}
