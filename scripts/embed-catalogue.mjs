// Embeds every product whose text changed since it was last embedded.
//
//   npm run embed:catalogue
//
// Reads .env.local and needs SUPABASE_SERVICE_ROLE_KEY: it writes to
// product_embeddings, which only admins and the service role may touch. Safe to
// re-run; unchanged products are skipped by content hash. Run it after seeding,
// or after editing products outside the admin panel.

import { createClient } from '@supabase/supabase-js'
import {
  contentHash,
  embedTexts,
  productEmbeddingText,
  toPgVector,
} from '../src/lib/embeddings.ts'

const BATCH_SIZE = 16

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).')
  process.exit(1)
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const [productsResult, embeddingsResult] = await Promise.all([
  db.from('products').select('id, title, description, attributes, categories(name)'),
  db.from('product_embeddings').select('product_id, content_hash'),
])

for (const { error } of [productsResult, embeddingsResult]) {
  if (error) {
    console.error('Failed to read the catalogue:', error.message)
    if (error.code === '42P01' || /product_embeddings/.test(error.message)) {
      console.error('Run the "Semantic search" section of supabase/schema.sql first.')
    }
    process.exit(1)
  }
}

const storedHash = new Map(embeddingsResult.data.map((e) => [e.product_id, e.content_hash]))

const stale = []
for (const product of productsResult.data) {
  const text = productEmbeddingText({ ...product, category: product.categories?.name ?? null })
  const hash = await contentHash(text)
  if (storedHash.get(product.id) !== hash) stale.push({ id: product.id, text, hash })
}

console.log(`${productsResult.data.length} products, ${stale.length} to embed.`)

for (let i = 0; i < stale.length; i += BATCH_SIZE) {
  const batch = stale.slice(i, i + BATCH_SIZE)
  const embeddings = await embedTexts(
    batch.map((p) => p.text),
    { supabaseUrl: url, apiKey: anonKey ?? serviceKey, timeoutMs: 60_000 },
  )

  const { error } = await db.from('product_embeddings').upsert(
    batch.map((p, j) => ({
      product_id: p.id,
      embedding: toPgVector(embeddings[j]),
      content_hash: p.hash,
      updated_at: new Date().toISOString(),
    })),
  )
  if (error) {
    console.error('Failed to store embeddings:', error.message)
    process.exit(1)
  }
  console.log(`  embedded ${Math.min(i + BATCH_SIZE, stale.length)}/${stale.length}`)
}

console.log('Done.')
