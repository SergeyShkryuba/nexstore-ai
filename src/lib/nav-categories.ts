import { createPublicClient } from '@/utils/supabase/public'

export type NavCategory = { name: string; slug: string }

/**
 * Categories for the header and footer. Loaded once, in the root layout.
 * Never throws: navigation without categories beats a page that fails to
 * render because the database hiccuped.
 */
export async function loadNavCategories(): Promise<NavCategory[]> {
  try {
    const { data } = await createPublicClient().from('categories').select('name, slug').order('name')
    return (data ?? []) as NavCategory[]
  } catch {
    return []
  }
}
