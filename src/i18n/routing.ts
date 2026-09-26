import { defineRouting } from 'next-intl/routing'

export const LOCALES = ['en', 'es', 'ru'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

/**
 * English stays at the unprefixed URLs it always had (`/product/x`), so
 * existing links, Stripe return URLs and search results keep working; Spanish
 * and Russian live under `/es/...` and `/ru/...`.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
})

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * `/es/admin` → `{ locale: 'es', path: '/admin' }`; an unprefixed path is
 * English. The path is normalised first (percent-decoding, repeated slashes),
 * because access rules compare it: `//admin` or `/%61dmin` must not slip past
 * a check for `/admin`.
 */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  let normalised = pathname
  try {
    normalised = decodeURIComponent(pathname)
  } catch {
    // Malformed escapes: compare the raw path.
  }
  normalised = normalised.replace(/\/{2,}/g, '/')
  const [, first, ...rest] = normalised.split('/')
  if (isLocale(first) && first !== DEFAULT_LOCALE) return { locale: first, path: `/${rest.join('/')}` }
  if (first === DEFAULT_LOCALE) return { locale: DEFAULT_LOCALE, path: `/${rest.join('/')}` }
  return { locale: DEFAULT_LOCALE, path: normalised || '/' }
}

/** The URL of `path` in `locale`: `/cart` → `/es/cart`; English stays unprefixed. */
export function localizedPath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

/** BCP 47 tags for Intl formatting and Open Graph. */
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-IE', es: 'es-ES', ru: 'ru-RU' }
export const OG_LOCALE: Record<Locale, string> = { en: 'en_US', es: 'es_ES', ru: 'ru_RU' }

/** Names shown in the language switcher, each in its own language. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español', ru: 'Русский' }
