import type { MetadataRoute } from 'next'
import { createPublicClient } from '@/utils/supabase/public'
import { LOCALES, localizedPath } from '@/i18n/routing'

import { siteUrl } from '@/lib/site'

export const revalidate = 3600

type Entry = Omit<MetadataRoute.Sitemap[number], 'url' | 'alternates'>

/**
 * One entry per page per language, each listing the page's other languages,
 * so search engines index all three and link them as translations.
 */
function everyLanguage(path: string, entry: Entry): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `${siteUrl}${localizedPath(path, l)}`]))
  return LOCALES.map((locale) => ({
    url: `${siteUrl}${localizedPath(path, locale)}`,
    alternates: { languages },
    ...entry,
  }))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    ...everyLanguage('/', { changeFrequency: 'daily', priority: 1 }),
    ...everyLanguage('/categories/all', { changeFrequency: 'daily', priority: 0.8 }),
    ...['/about', '/contact', '/help/shipping-returns', '/privacy', '/terms'].flatMap((path) =>
      everyLanguage(path, { changeFrequency: 'yearly', priority: 0.3 }),
    ),
  ]

  try {
    const supabase = createPublicClient()
    const [{ data: products }, { data: categories }] = await Promise.all([
      supabase.from('products').select('slug, updated_at'),
      supabase.from('categories').select('slug'),
    ])

    return [
      ...staticEntries,
      ...(categories ?? []).flatMap((c) =>
        everyLanguage(`/categories/${c.slug}`, { changeFrequency: 'weekly', priority: 0.7 }),
      ),
      ...(products ?? []).flatMap((p) =>
        everyLanguage(`/product/${p.slug}`, {
          lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
          changeFrequency: 'weekly',
          priority: 0.6,
        }),
      ),
    ]
  } catch (error) {
    // A sitemap that throws takes the whole build down; an incomplete one does not.
    console.error('sitemap: failed to load catalogue', error)
    return staticEntries
  }
}
