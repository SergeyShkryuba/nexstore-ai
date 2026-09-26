import type { SupabaseClient } from '@supabase/supabase-js'
import { rankProducts, extractMaxPrice, type SearchableProduct } from '@/lib/search'
import { PRODUCT_TRANSLATIONS, localizeProduct } from '@/lib/localized'
import type { Locale } from '@/i18n/routing'

/**
 * Catalogue search shared by the search box (/api/search) and the shop
 * assistant (/api/chat): keyword ranking in the query's language, with a
 * budget ("under 60", "до 60") applied as a price filter.
 */

export type SearchVariant = { size: string; inventory_count: number; sort_order: number | null }

export type SearchHit = SearchableProduct & {
  inventory_count: number
  variants?: SearchVariant[] | null
}

export type CatalogueSearch = {
  /** Budget the parser found in the query, if any. */
  maxPrice: number | null
  results: Array<{ product: SearchHit; score: number; matchedTerms: string[] }>
}

export class CatalogueUnavailableError extends Error {}

/**
 * Ranks the catalogue against `query`, written in `locale`: a Spanish query is
 * matched against Spanish titles. Results come back in `displayLocale`
 * (default: the query's), so the assistant can search the English base titles
 * and still show a Russian shopper Russian ones.
 */
export async function searchCatalogue(
  supabase: Pick<SupabaseClient, 'from'>,
  query: string,
  locale: Locale,
  displayLocale: Locale = locale,
): Promise<CatalogueSearch> {
  const [{ data: products, error: productsError }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select(
        `id, title, slug, description, price, category_id, image_urls, attributes, inventory_count, variants:product_variants(size, inventory_count, sort_order), ${PRODUCT_TRANSLATIONS}`,
      ),
    supabase.from('categories').select('id, slug'),
  ])

  if (productsError) {
    console.error('Search: failed to load products', productsError)
    throw new CatalogueUnavailableError('products unavailable')
  }

  type Row = SearchHit & { translations?: never[] | null }
  const rows = (products ?? []) as Row[]
  const catalogue = rows.map((p) => localizeProduct(p, locale)) as SearchHit[]
  const categorySlugToId = Object.fromEntries((categories ?? []).map((c) => [c.slug as string, c.id as string]))

  let results = rankProducts(query, catalogue, { categorySlugToId })
  if (displayLocale !== locale) {
    const rowById = new Map(rows.map((p) => [p.id, p]))
    results = results.map((r) => {
      const row = rowById.get(r.product.id)
      return row ? { ...r, product: localizeProduct(row, displayLocale) as SearchHit } : r
    })
  }

  return { maxPrice: extractMaxPrice(query), results }
}
