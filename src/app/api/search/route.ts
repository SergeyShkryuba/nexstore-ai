import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { rankProducts, extractMaxPrice, removeBudget, type SearchableProduct } from '@/lib/search'
import { fuseResults, type SemanticMatch } from '@/lib/hybrid'
import { embedTexts, toPgVector } from '@/lib/embeddings'
import { clientIp, hitLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/utils/supabase/service'
import { LOCALES } from '@/i18n/routing'
import { translatorFor } from '@/i18n/messages'
import { PRODUCT_TRANSLATIONS, localizeProducts } from '@/lib/localized'

export const runtime = 'nodejs'

const searchRequestSchema = z.object({
  query: z.string().trim().min(2, 'tooShort').max(200, 'tooLong'),
  // Results come back with titles in this language, and it is ranked against them.
  locale: z.enum(LOCALES).default('en'),
})

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

export type SearchResponse = {
  query: string
  /** Budget the parser found in the query, if any — surfaced so the UI can show it. */
  maxPrice: number | null
  results: Array<{
    product: SearchableProduct
    score: number
    matchedTerms: string[]
    /** Cosine similarity when the semantic ranker found the product. */
    similarity: number | null
  }>
  /**
   * How the results were produced. The UI shows this; nothing is faked:
   * `lexical` means the semantic half was unavailable for this request.
   */
  strategy: 'hybrid' | 'lexical'
  took_ms: number
}

/** Nearest products to the query, or null when semantic search is unavailable. */
async function semanticMatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  query: string,
): Promise<SemanticMatch[] | null> {
  const text = removeBudget(query)
  if (text.length < 2) return null

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

export async function POST(req: Request) {
  const startedAt = Date.now()

  // Read first so errors come back in the shopper's language; a small JSON
  // body is not what a flood costs us — the embedding call below is.
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    // Answered after the limiter.
  }
  const { t } = translatorFor((body as { locale?: unknown } | null)?.locale)

  // Every search calls the embedding Edge Function; a flood would burn through
  // the project's function quota. Type-ahead (/api/search/suggest) is lexical
  // and CDN-cached, so it is not limited.
  const limited = await hitLimit(createServiceClient(), 'search', clientIp(req.headers))
  if (!limited.allowed) {
    return NextResponse.json(
      { error: t('Search.api.tooMany') },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  const parsed = searchRequestSchema.safeParse(body)
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message
    const error = code === 'tooShort' || code === 'tooLong' ? t(`Search.api.${code}`) : t('Search.api.invalid')
    return NextResponse.json({ error }, { status: 400 })
  }

  const { query, locale } = parsed.data

  try {
    const supabase = await createClient()

    const [{ data: products, error: productsError }, { data: categories }, semantic] =
      await Promise.all([
        supabase
          .from('products')
          .select(`id, title, slug, description, price, category_id, image_urls, attributes, inventory_count, variants:product_variants(size, inventory_count, sort_order), ${PRODUCT_TRANSLATIONS}`),
        supabase.from('categories').select('id, slug'),
        semanticMatches(supabase, query),
      ])

    if (productsError) {
      console.error('Search: failed to load products', productsError)
      return NextResponse.json({ error: t('Search.api.unavailable') }, { status: 503 })
    }

    // Ranked in the shopper's language: a Spanish query is matched against
    // Spanish titles. (The semantic half stays English: gte-small is an
    // English model.)
    const catalogue = localizeProducts(products, locale) as SearchableProduct[]
    const categorySlugToId = Object.fromEntries(
      (categories ?? []).map((c) => [c.slug as string, c.id as string]),
    )

    const maxPrice = extractMaxPrice(query)
    const lexical = rankProducts(query, catalogue, { categorySlugToId })

    const response: SearchResponse = {
      query,
      maxPrice,
      results:
        semantic === null
          ? lexical.map((r) => ({ ...r, similarity: null }))
          : fuseResults(lexical, semantic, catalogue, {
              maxPrice,
              minSimilarity: MIN_SIMILARITY,
              maxGap: MAX_SIMILARITY_GAP,
            }),
      strategy: semantic === null ? 'lexical' : 'hybrid',
      took_ms: Date.now() - startedAt,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Search API error:', error)
    return NextResponse.json({ error: t('Search.api.failed') }, { status: 500 })
  }
}
