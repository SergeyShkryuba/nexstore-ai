import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { clientIp, hitLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/utils/supabase/service'
import { LOCALES } from '@/i18n/routing'
import { translatorFor } from '@/i18n/messages'
import { CatalogueUnavailableError, searchCatalogue, type CatalogueSearch } from '@/lib/search-service'

export const runtime = 'nodejs'

const searchRequestSchema = z.object({
  query: z.string().trim().min(2, 'tooShort').max(200, 'tooLong'),
  // Results come back with titles in this language, and it is ranked against them.
  locale: z.enum(LOCALES).default('en'),
})

export type SearchResponse = CatalogueSearch & {
  query: string
  took_ms: number
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
    // (The semantic half stays English: gte-small is an English model.)
    const search = await searchCatalogue(await createClient(), query, locale)
    const response: SearchResponse = { query, ...search, took_ms: Date.now() - startedAt }
    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof CatalogueUnavailableError) {
      return NextResponse.json({ error: t('Search.api.unavailable') }, { status: 503 })
    }
    console.error('Search API error:', error)
    return NextResponse.json({ error: t('Search.api.failed') }, { status: 500 })
  }
}
