import { NextResponse } from 'next/server'
import { createPublicClient } from '@/utils/supabase/public'
import { rankProducts, type SearchableProduct } from '@/lib/search'

export const runtime = 'nodejs'

export type Suggestion = {
  id: string
  title: string
  slug: string
  price: number
  image_url: string | null
}

/**
 * Type-ahead suggestions: `GET /api/search/suggest?q=head`.
 *
 * Lexical only, and deliberately so — it runs on every pause in typing, and the
 * ranker already prefix-matches ("head" finds "headphones"). The full hybrid
 * search runs when the shopper submits.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 100) ?? ''
  if (q.length < 2) return NextResponse.json({ suggestions: [] })

  const { data, error } = await createPublicClient()
    .from('products')
    .select('id, title, slug, description, price, category_id, image_urls, attributes')

  if (error) {
    console.error('Suggest: failed to load products', error)
    return NextResponse.json({ suggestions: [] }, { status: 503 })
  }

  const suggestions: Suggestion[] = rankProducts(q, (data ?? []) as SearchableProduct[], {
    limit: 5,
  }).map(({ product }) => ({
    id: product.id,
    title: product.title,
    slug: product.slug,
    price: product.price,
    image_url: product.image_urls?.[0] ?? null,
  }))

  return NextResponse.json(
    { suggestions },
    // Same prefix, same answer: let the CDN absorb repeated keystrokes.
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  )
}
