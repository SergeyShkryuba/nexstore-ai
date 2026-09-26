import { INTL_LOCALE, type Locale } from '@/i18n/routing'

/**
 * Shared money formatting. The store prices and Stripe checkout are both EUR;
 * only the presentation follows the language (€24.99, 24,99 €, 24,99 €).
 */
const formatters = new Map<Locale, Intl.NumberFormat>()

function priceFormatter(locale: Locale): Intl.NumberFormat {
  let formatter = formatters.get(locale)
  if (!formatter) {
    formatter = new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'currency', currency: 'EUR' })
    formatters.set(locale, formatter)
  }
  return formatter
}

export function formatPrice(value: number | string, locale: Locale = 'en'): string {
  const amount = typeof value === 'string' ? Number.parseFloat(value) : value
  return priceFormatter(locale).format(Number.isFinite(amount) ? amount : 0)
}

/** A calendar date in the visitor's language. */
export function formatDate(value: string | Date, locale: Locale = 'en'): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: 'medium' }).format(new Date(value))
}

/** Average of a set of 1–5 ratings, rounded to one decimal. Null when empty. */
export function averageRating(ratings: readonly number[]): number | null {
  if (ratings.length === 0) return null
  const sum = ratings.reduce((acc, r) => acc + r, 0)
  return Math.round((sum / ratings.length) * 10) / 10
}
