import type { MetadataRoute } from 'next'
import { createPublicClient } from '@/utils/supabase/public'

import { siteUrl } from '@/lib/site'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/categories/all`, changeFrequency: 'daily', priority: 0.8 },
    ...['/about', '/help/shipping-returns', '/privacy', '/terms'].map((path) => ({
      url: `${siteUrl}${path}`,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ]

  try {
    const supabase = createPublicClient()
    const [{ data: products }, { data: categories }] = await Promise.all([
      supabase.from('products').select('slug, updated_at'),
      supabase.from('categories').select('slug'),
    ])

    return [
      ...staticEntries,
      ...(categories ?? []).map((c) => ({
        url: `${siteUrl}/categories/${c.slug}`,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
      ...(products ?? []).map((p) => ({
        url: `${siteUrl}/product/${p.slug}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      })),
    ]
  } catch (error) {
    // A sitemap that throws takes the whole build down; an incomplete one does not.
    console.error('sitemap: failed to load catalogue', error)
    return staticEntries
  }
}
