/**
 * schema.org JSON-LD for search engines. Pure: plain data in, plain objects out.
 *
 * Everything here must match what the page itself shows and promises —
 * Google treats structured data that says more than the page as spam. So no
 * brand (products have none), a rating only when real reviews exist, and the
 * shipping and return terms of /help/shipping-returns, word for word.
 */

import { EU_COUNTRIES } from './orders'

type Json = Record<string, unknown>

/**
 * For a <script type="application/ld+json">. Product text is data an admin
 * typed; a "</script>" in it would end the tag early and run whatever follows.
 * Escaping "<" makes that impossible (the Next.js JSON-LD guide's advice).
 */
export function serializeJsonLd(data: Json): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export type Crumb = { name: string; path: string }

export function breadcrumbJsonLd(crumbs: readonly Crumb[], siteUrl: string): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: new URL(crumb.path, siteUrl).href,
    })),
  }
}

type ProductInput = {
  title: string
  slug: string
  description: string | null
  price: number | string
  inventory_count: number
  image_urls: string[] | null
}

const EU_REGIONS = EU_COUNTRIES.map((country) => ({ '@type': 'DefinedRegion', addressCountry: country }))

export function productJsonLd(
  product: ProductInput,
  options: { siteUrl: string; category?: string | null; ratings?: readonly number[] },
): Json {
  const url = new URL(`/product/${product.slug}`, options.siteUrl).href
  const ratings = options.ratings ?? []

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    sku: product.slug,
    url,
    ...(product.description ? { description: product.description } : {}),
    ...(product.image_urls?.length ? { image: product.image_urls } : {}),
    ...(options.category ? { category: options.category } : {}),
    ...(ratings.length > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10,
            reviewCount: ratings.length,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'EUR',
      price: Number(product.price).toFixed(2),
      itemCondition: 'https://schema.org/NewCondition',
      availability:
        product.inventory_count > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      // /help/shipping-returns: free EU shipping, dispatched in 1–2 business
      // days, delivered 2–5 days later; returns within 30 days.
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: 'EUR' },
        shippingDestination: EU_REGIONS,
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 2, unitCode: 'DAY' },
          transitTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 5, unitCode: 'DAY' },
        },
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: [...EU_COUNTRIES],
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnMethod: 'https://schema.org/ReturnByMail',
      },
    },
  }
}
