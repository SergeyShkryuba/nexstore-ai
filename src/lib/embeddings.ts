/**
 * Shared embedding helpers for semantic search.
 *
 * No imports on purpose: besides the Next.js app, this file is loaded directly
 * by `scripts/embed-catalogue.mjs` through Node's built-in TypeScript type
 * stripping, which cannot resolve the `@/` alias. Keep it to erasable syntax
 * (annotations only — no enums or parameter properties).
 */

/** gte-small, the model the `embed` Edge Function runs. */
export const EMBEDDING_DIMENSIONS = 384

export type EmbeddableProduct = {
  title: string
  description: string | null
  attributes?: Record<string, unknown> | null
  category?: string | null
}

/**
 * The text a product is embedded from. Title first and repeated in the
 * category line: gte-small truncates long inputs, and the title is the most
 * reliable signal of what the product is.
 */
export function productEmbeddingText(product: EmbeddableProduct): string {
  const parts = [product.title]
  if (product.category) parts.push(`${product.category}: ${product.title}`)
  if (product.description) parts.push(product.description)
  if (product.attributes) {
    const attributes = Object.entries(product.attributes)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(', ')
    if (attributes) parts.push(attributes)
  }
  return parts.join('. ').replace(/\s+/g, ' ').trim()
}

/** SHA-256 of the embedded text, so unchanged products are not re-embedded. */
export async function contentHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** pgvector's text format: `[0.1,0.2,...]`. */
export function toPgVector(embedding: readonly number[]): string {
  return `[${embedding.join(',')}]`
}

type EmbedOptions = {
  supabaseUrl?: string
  apiKey?: string
  timeoutMs?: number
}

/**
 * Embeds texts with the `embed` Edge Function. Throws on any failure — callers
 * decide whether that is fatal (the backfill) or a reason to fall back to
 * lexical ranking (search).
 *
 * Server-only: the function accepts only the service-role key, so the public
 * anon key cannot be used to call it around the search rate limit.
 */
export async function embedTexts(
  texts: readonly string[],
  options: EmbedOptions = {},
): Promise<number[][]> {
  const supabaseUrl = options.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const apiKey = options.apiKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !apiKey) throw new Error('Supabase URL or key is not configured')

  const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/embed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      apikey: apiKey,
    },
    body: JSON.stringify({ input: texts }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
  })

  if (!res.ok) {
    throw new Error(`embed function returned ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }

  const { embeddings } = (await res.json()) as { embeddings?: unknown }
  if (
    !Array.isArray(embeddings) ||
    embeddings.length !== texts.length ||
    !embeddings.every((e) => Array.isArray(e) && e.length === EMBEDDING_DIMENSIONS)
  ) {
    throw new Error('embed function returned an unexpected payload')
  }
  return embeddings as number[][]
}
