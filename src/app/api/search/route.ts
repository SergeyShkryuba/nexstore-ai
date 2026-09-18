import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { rankProducts, extractMaxPrice, type SearchableProduct } from '@/lib/search'

export const runtime = 'nodejs'

const searchRequestSchema = z.object({
  query: z.string().trim().min(2, 'Query must be at least 2 characters').max(200),
})

export type SearchResponse = {
  query: string
  /** Budget the parser found in the query, if any — surfaced so the UI can show it. */
  maxPrice: number | null
  results: Array<{
    product: SearchableProduct
    score: number
    matchedTerms: string[]
  }>
  /** How the results were produced. The UI shows this; nothing is faked. */
  strategy: 'lexical'
  took_ms: number
}

export async function POST(req: Request) {
  const startedAt = Date.now()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = searchRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 },
    )
  }

  const { query } = parsed.data

  try {
    const supabase = await createClient()

    const [{ data: products, error: productsError }, { data: categories }] = await Promise.all([
      supabase
        .from('products')
        .select('id, title, slug, description, price, category_id, image_urls, attributes'),
      supabase.from('categories').select('id, slug'),
    ])

    if (productsError) {
      console.error('Search: failed to load products', productsError)
      return NextResponse.json({ error: 'Search is temporarily unavailable' }, { status: 503 })
    }

    const categorySlugToId = Object.fromEntries(
      (categories ?? []).map((c) => [c.slug as string, c.id as string]),
    )

    const results = rankProducts(query, (products ?? []) as SearchableProduct[], {
      categorySlugToId,
    })

    const response: SearchResponse = {
      query,
      maxPrice: extractMaxPrice(query),
      results,
      strategy: 'lexical',
      took_ms: Date.now() - startedAt,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Search API error:', error)
    return NextResponse.json({ error: 'Failed to process search' }, { status: 500 })
  }
}
