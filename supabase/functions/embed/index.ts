// Supabase Edge Function: text -> gte-small embeddings (384 dimensions).
//
// Runs Supabase's built-in model, so there is no third-party API key. Called
// by the Next.js search route (one query at a time) and by the catalogue
// backfill script (in batches). Requests need a valid JWT — the anon key is
// enough — which the platform checks before this code runs.
//
// Deploy: Supabase dashboard -> Edge Functions -> new function named `embed`,
// paste this file; or `npx supabase functions deploy embed`.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const session = new Supabase.ai.Session('gte-small')

const MAX_INPUTS = 32
const MAX_CHARS = 2000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const input = (body as { input?: unknown } | null)?.input
  const texts = typeof input === 'string' ? [input] : input

  const valid =
    Array.isArray(texts) &&
    texts.length > 0 &&
    texts.length <= MAX_INPUTS &&
    texts.every((t) => typeof t === 'string' && t.trim() !== '' && t.length <= MAX_CHARS)

  if (!valid) {
    return json(
      { error: `"input" must be a non-empty string or an array of 1-${MAX_INPUTS} strings of at most ${MAX_CHARS} characters` },
      400,
    )
  }

  const embeddings: number[][] = []
  for (const text of texts as string[]) {
    // Mean-pooled and normalised, so cosine similarity is a plain dot product.
    embeddings.push((await session.run(text, { mean_pool: true, normalize: true })) as number[])
  }

  return json({ model: 'gte-small', dimensions: embeddings[0].length, embeddings })
})
