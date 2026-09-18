import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

/**
 * Browser Supabase client.
 *
 * Memoised on purpose: components used to call this in their render body, which
 * built a fresh client (and a fresh auth listener) on every render and made
 * `supabase` an unstable dependency for every `useEffect` that touched it.
 */
export function createClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return client
}
