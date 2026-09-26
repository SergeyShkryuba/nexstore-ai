import { createHmac } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Request limits for the routes that cost something (see "Rate limiting" in
 * schema.sql). Counters live in Postgres because serverless instances share
 * no memory.
 */
export const LIMITS = {
  /** Each attempt reserves stock and opens a Stripe session. */
  checkout: { limit: 10, windowSeconds: 10 * 60 },
  /** Each search embeds the query through the Edge Function. */
  search: { limit: 30, windowSeconds: 60 },
  /** Each cancel can call Stripe; a shopper needs one per abandoned checkout. */
  cancel: { limit: 20, windowSeconds: 10 * 60 },
  /** Each chat message is a paid model call, plus a search when it asks for one. */
  chat: { limit: 20, windowSeconds: 10 * 60 },
  /** And a daily ceiling, so a patient script cannot run up the bill either. */
  chatDaily: { limit: 150, windowSeconds: 24 * 60 * 60 },
  /** Each "talk to a person" request lands in the admin's inbox. */
  support: { limit: 5, windowSeconds: 60 * 60 },
} as const

export type LimitScope = keyof typeof LIMITS

/**
 * How many checkouts one shopper may hold open at once. Each holds its units
 * for ~36 minutes, so without a cap one visitor could empty the shelf.
 */
export const MAX_HELD_CHECKOUTS = 3

/**
 * The caller's IP. On Vercel both headers are set by the platform and a
 * client-sent value is overwritten, so they cannot be spoofed there. Anywhere
 * else they are only as trustworthy as the proxy in front; with no header at
 * all (local dev) every caller shares one bucket.
 */
export function clientIp(headers: Headers): string {
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || 'unknown'
}

/**
 * A stable, non-reversible key for `scope` + `id`. HMAC rather than a plain
 * hash: the IPv4 space is small enough to brute-force a bare SHA-256, so the
 * table would effectively store addresses. Null when the server has no secret
 * to key it with — the caller then skips limiting rather than storing raw ids.
 */
export function limitKey(scope: string, id: string, secret = process.env.SUPABASE_SERVICE_ROLE_KEY): string | null {
  if (!secret) return null
  return createHmac('sha256', secret).update(`nexstore:${scope}:${id}`).digest('base64url')
}

export type LimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

/**
 * Counts one request against the scope's limit.
 *
 * Fails open: if the counter cannot be reached (no service client, schema.sql
 * not yet run, database hiccup) the request goes through and the error is
 * logged. A limiter outage should not take checkout down with it.
 */
export async function hitLimit(
  service: Pick<SupabaseClient, 'rpc'> | null,
  scope: LimitScope,
  id: string,
): Promise<LimitResult> {
  const { limit, windowSeconds } = LIMITS[scope]
  const key = limitKey(scope, id)
  if (!service || !key) return { allowed: true }

  const { data, error } = await service.rpc('rate_limit_hit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    console.error(`Rate limit (${scope}): counter unavailable, allowing the request`, error)
    return { allowed: true }
  }
  if (data === false) {
    // The window is fixed, so the wait is at most one window.
    const intoWindow = Math.floor(Date.now() / 1000) % windowSeconds
    return { allowed: false, retryAfterSeconds: windowSeconds - intoWindow }
  }
  return { allowed: true }
}
