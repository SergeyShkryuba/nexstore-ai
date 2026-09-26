import type { SupabaseClient } from '@supabase/supabase-js'
import { rankProducts, extractMaxPrice, removeBudget, type SearchableProduct } from '@/lib/search'
import { fuseResults, type SemanticMatch } from '@/lib/hybrid'
import { embedTexts, isEmbeddableQuery, toPgVector } from '@/lib/embeddings'
import { PRODUCT_TRANSLATIONS, localizeProduct } from '@/lib/localized'
import type { Locale } from '@/i18n/routing'

/**
 * Catalogue search shared by the search box (/api/search) and the shop
 * assistant (/api/chat): lexical ranking in the query's language, fused with
 * nearest-neighbour matches when the embedding function answers.
 */

/**
 * Semantic cut-offs, calibrated on the demo catalogue: on-topic matches for
 * natural queries score 0.80–0.92, the best match for things the shop does not
 * sell ("kitchen knife", "dog food") stays below 0.80, and noise sits more than
 * 0.05 under the best match. See `FuseOptions`.
 */
const MIN_SIMILARITY = 0.8
const MAX_SIMILARITY_GAP = 0.05

/** Semantic search is best-effort: a slow or failing Edge Function must not stall search. */
const EMBED_TIMEOUT_MS = 5000

export type SearchVariant = { size: string; inventory_count: number; sort_order: number | null }

export type SearchHit = SearchableProduct & {
  inventory_count: number
  variants?: SearchVariant[] | null
}

export type CatalogueSearch = {
  /** Budget the parser found in the query, if any. */
  maxPrice: number | null
  results: Array<{
    product: SearchHit
    score: number
    matchedTerms: string[]
    /** Cosine similarity when the semantic ranker found the product. */
    similarity: number | null
  }>
  /** `lexical` means the semantic half was unavailable for this request. */
  strategy: 'hybrid' | 'lexical'
}

/** Nearest products to the query, or null when semantic search is unavailable. */
async function semanticMatches(supabase: Pick<SupabaseClient, 'rpc'>, query: string): Promise<SemanticMatch[] | null> {
  const text = removeBudget(query)
  if (text.length < 2 || !isEmbeddableQuery(text)) return null

  try {
    const [embedding] = await embedTexts([text], { timeoutMs: EMBED_TIMEOUT_MS })
    const { data, error } = await supabase.rpc('match_products', {
      query_embedding: toPgVector(embedding),
      match_count: 20,
    })
    if (error) throw error
    return (data ?? []) as SemanticMatch[]
  } catch (error) {
    console.error('Search: semantic half unavailable, falling back to lexical', error)
    return null
  }
}

export class CatalogueUnavailableError extends Error {}

/**
 * Ranks the catalogue against `query`, written in `locale`: a Spanish query is
 * matched against Spanish titles. Results come back in `displayLocale`
 * (default: the query's), so the assistant can search in English — where the
 * semantic half works — and still show a Russian shopper Russian titles.
 */
export async function searchCatalogue(
  supabase: Pick<SupabaseClient, 'from' | 'rpc'>,
  query: string,
  locale: Locale,
  displayLocale: Locale = locale,
): Promise<CatalogueSearch> {
  const [{ data: products, error: productsError }, { data: categories }, semantic] = await Promise.all([
    supabase
      .from('products')
      .select(
        `id, title, slug, description, price, category_id, image_urls, attributes, inventory_count, variants:product_variants(size, inventory_count, sort_order), ${PRODUCT_TRANSLATIONS}`,
      ),
    supabase.from('categories').select('id, slug'),
    semanticMatches(supabase, query),
  ])

  if (productsError) {
    console.error('Search: failed to load products', productsError)
    throw new CatalogueUnavailableError('products unavailable')
  }

  type Row = SearchHit & { translations?: never[] | null }
  const rows = (products ?? []) as Row[]
  const catalogue = rows.map((p) => localizeProduct(p, locale)) as SearchHit[]
  const categorySlugToId = Object.fromEntries((categories ?? []).map((c) => [c.slug as string, c.id as string]))

  const maxPrice = extractMaxPrice(query)
  const lexical = rankProducts(query, catalogue, { categorySlugToId })
  const ranked =
    semantic === null
      ? lexical.map((r) => ({ ...r, similarity: null }))
      : fuseResults(lexical, semantic, catalogue, {
          maxPrice,
          minSimilarity: MIN_SIMILARITY,
          maxGap: MAX_SIMILARITY_GAP,
        })

  let results = ranked
  if (displayLocale !== locale) {
    const rowById = new Map(rows.map((p) => [p.id, p]))
    results = ranked.map((r) => {
      const row = rowById.get(r.product.id)
      return row ? { ...r, product: localizeProduct(row, displayLocale) as SearchHit } : r
    })
  }

  return { maxPrice, results, strategy: semantic === null ? 'lexical' : 'hybrid' }
}
