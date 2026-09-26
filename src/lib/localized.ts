/**
 * Catalogue text in the visitor's language (see "Translations" in schema.sql).
 *
 * Queries embed every translation of a row — there are at most two, Spanish
 * and Russian — and these helpers pick the one for the locale. English is the
 * row itself, and anything a translation leaves out falls back to it.
 *
 * Pure (no imports beyond types), so the rules are unit-tested.
 */
import type { Locale } from '@/i18n/routing'

/** Add to a `products` select: `select(\`id, title, ${PRODUCT_TRANSLATIONS}\`)`. */
export const PRODUCT_TRANSLATIONS = 'translations:product_translations(locale, title, description, attributes)'
/** Add to a `categories` select. */
export const CATEGORY_TRANSLATIONS = 'translations:category_translations(locale, name, description)'

type ProductTranslation = {
  locale: string
  title: string | null
  description: string | null
  attributes: Record<string, unknown> | null
}

type CategoryTranslation = {
  locale: string
  name: string | null
  description: string | null
}

type WithTranslations<T> = { translations?: T[] | null }

function pick<T extends { locale: string }>(translations: T[] | null | undefined, locale: Locale): T | undefined {
  return locale === 'en' ? undefined : translations?.find((t) => t.locale === locale)
}

/**
 * The product with its title, description and specifications in `locale`.
 * Only fields the row already has are replaced, so a card that did not select
 * the description does not gain one; `translations` is dropped either way.
 */
export function localizeProduct<P extends { title: string } & WithTranslations<ProductTranslation>>(
  product: P,
  locale: Locale,
): Omit<P, 'translations'> {
  const { translations, ...base } = product
  const t = pick(translations, locale)
  if (!t) return base
  const out: Record<string, unknown> = { ...base }
  if (t.title) out.title = t.title
  if ('description' in base && t.description) out.description = t.description
  if ('attributes' in base && t.attributes && Object.keys(t.attributes).length > 0) out.attributes = t.attributes
  return out as Omit<P, 'translations'>
}

export function localizeProducts<P extends { title: string } & WithTranslations<ProductTranslation>>(
  products: readonly P[] | null | undefined,
  locale: Locale,
): Omit<P, 'translations'>[] {
  return (products ?? []).map((p) => localizeProduct(p, locale))
}

export function localizeCategory<C extends { name: string } & WithTranslations<CategoryTranslation>>(
  category: C,
  locale: Locale,
): Omit<C, 'translations'> {
  const { translations, ...base } = category
  const t = pick(translations, locale)
  if (!t) return base
  const out: Record<string, unknown> = { ...base }
  if (t.name) out.name = t.name
  if ('description' in base && t.description) out.description = t.description
  return out as Omit<C, 'translations'>
}

export function localizeCategories<C extends { name: string } & WithTranslations<CategoryTranslation>>(
  categories: readonly C[] | null | undefined,
  locale: Locale,
): Omit<C, 'translations'>[] {
  return (categories ?? []).map((c) => localizeCategory(c, locale))
}
