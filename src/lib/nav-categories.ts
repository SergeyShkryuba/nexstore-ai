import { createPublicClient } from '@/utils/supabase/public'
import { CATEGORY_TRANSLATIONS, localizeCategories } from '@/lib/localized'
import type { Locale } from '@/i18n/routing'

export type NavCategory = { name: string; slug: string }

/**
 * Categories for the header and footer, named in the visitor's language.
 * Loaded once, in the locale layout. Never throws: navigation without
 * categories beats a page that fails to render because the database hiccuped.
 */
export async function loadNavCategories(locale: Locale): Promise<NavCategory[]> {
  try {
    const { data } = await createPublicClient()
      .from('categories')
      .select(`name, slug, ${CATEGORY_TRANSLATIONS}`)
      .order('name')
    return localizeCategories(data, locale).map(({ name, slug }) => ({ name, slug }))
  } catch {
    return []
  }
}
