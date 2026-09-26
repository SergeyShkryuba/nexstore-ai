import { LOCALES, localizedPath, type Locale } from '@/i18n/routing'

/**
 * `alternates` for a page's metadata: its canonical URL in this language, and
 * hreflang links to the same page in every language (plus `x-default`, the
 * English one), so search engines show each visitor their own version instead
 * of treating the three as duplicates.
 *
 * `path` is the English, unprefixed path, e.g. `/product/mech-keyboard`.
 */
export function alternates(path: string, locale: Locale) {
  const languages: Record<string, string> = Object.fromEntries(
    LOCALES.map((l) => [l, localizedPath(path, l)]),
  )
  languages['x-default'] = path
  return { canonical: localizedPath(path, locale), languages }
}
