// Supabase Edge Function: text -> gte-small embeddings (384 dimensions).
//
// Runs Supabase's built-in model, so there is no third-party API key. Called
// by the Next.js search route (one query at a time), the admin panel and the
// catalogue backfill script (in batches) — all server-side.
//
// Only the service-role key is accepted. It used to be "any valid JWT", and
// the anon key is public (it ships in the browser bundle), so anyone could
// call this directly — up to 32 × 2000 characters a request — around the
// search route's rate limit, spending the project's function quota. The
// check does not depend on the "Enforce JWT verification" setting.
//
// Deploy: Supabase dashboard -> Edge Functions -> new function named `embed`,
// paste this file; or `npx supabase functions deploy embed`.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const session = new Supabase.ai.Session('gte-small')

// Provided to every Edge Function by the platform.
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const MAX_INPUTS = 32
const MAX_CHARS = 2000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Equal-time comparison: hash both, then compare every byte. */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(given)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Fails closed: without the key to compare against, nobody gets in.
  if (!SERVICE_KEY) return json({ error: 'Function is not configured' }, 500)
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token || !(await sameSecret(token, SERVICE_KEY))) {
    return json({ error: 'Unauthorized' }, 401)
  }

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
