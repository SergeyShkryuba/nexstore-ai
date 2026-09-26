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
// How the key is recognised: Supabase Auth is asked. A token that can list
// users through the Auth admin API is a service-role key, whatever its format
// (legacy JWT or the newer `sb_secret_…` keys) — an earlier version compared
// it with the SUPABASE_SERVICE_ROLE_KEY env var, which the platform may fill
// with a different key of the same project, and so refused the real one.
// Accepted keys are remembered (as hashes) for the life of the instance, so
// Auth is asked once, not on every search.
//
// Deploy: Supabase dashboard -> Edge Functions -> new function named `embed`,
// paste this file; or `npx supabase functions deploy embed`.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const session = new Supabase.ai.Session('gte-small')

// Provided to every Edge Function by the platform.
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '')
const ENV_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const MAX_INPUTS = 32
const MAX_CHARS = 2000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

/** Equal-time comparison of two digests. */
function sameBytes(x: Uint8Array, y: Uint8Array): boolean {
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/** Hashes of tokens Auth has confirmed as service-role keys. Only successes are kept. */
const confirmed = new Set<string>()

async function isServiceKey(token: string): Promise<boolean> {
  const digest = await sha256(token)
  if (confirmed.has(hex(digest))) return true
  // Fast path: the platform's own copy of the key, when it is the same one.
  if (ENV_SERVICE_KEY && sameBytes(digest, await sha256(ENV_SERVICE_KEY))) return true
  if (!SUPABASE_URL) return false

  // Only a service-role key may use the Auth admin API. Anything else — the
  // anon key, a user's session token, garbage — gets 401 or 403.
  try {
    // Legacy keys are JWTs and go in both headers; the newer `sb_secret_…`
    // keys are not JWTs and belong in `apikey` only.
    const isJwt = token.split('.').length === 3
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: isJwt ? { apikey: token, Authorization: `Bearer ${token}` } : { apikey: token },
      signal: AbortSignal.timeout(3000),
    })
    await res.body?.cancel()
    if (!res.ok) return false
  } catch {
    // Fails closed: if Auth cannot be asked, the caller falls back to keyword search.
    return false
  }

  if (confirmed.size >= 20) confirmed.clear()
  confirmed.add(hex(digest))
  return true
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token || !(await isServiceKey(token))) {
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
