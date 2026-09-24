import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role client: bypasses RLS. Server-only — for the Stripe webhook, the
 * stock reservation calls in checkout and the daily cron. Never import it into
 * a client component, and never let a request choose what it writes.
 *
 * Null when the key is missing, so callers fail loudly instead of falling back
 * to the anon key, which an earlier webhook did and which only produced silent
 * write failures.
 */
export function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}
