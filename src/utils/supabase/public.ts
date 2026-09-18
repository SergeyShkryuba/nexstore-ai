import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

/**
 * Anonymous, cookie-free Supabase client for public catalogue reads.
 *
 * The cookie-bound server client (`utils/supabase/server`) reads `cookies()`,
 * which opts the whole route out of static rendering. Catalogue pages have no
 * per-user content, so they use this client instead and can be prerendered and
 * revalidated on a timer. Row Level Security still applies: this key only ever
 * sees what an anonymous visitor may see.
 */
export function createPublicClient(): SupabaseClient {
  if (!client) {
    client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    )
  }
  return client
}
