import type { MetadataRoute } from 'next'

import { siteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Nothing useful to a crawler, and /admin is behind auth anyway.
        disallow: ['/admin', '/api/', '/profile', '/wishlist', '/cart', '/checkout'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
