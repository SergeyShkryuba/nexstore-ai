import { describe, it, expect } from 'vitest'
import { breadcrumbJsonLd, productJsonLd, serializeJsonLd } from './structured-data'

const SITE = 'https://shop.example'

const product = {
  title: 'Wireless Headphones',
  slug: 'wireless-headphones',
  description: 'Noise-cancelling.',
  price: 299.99,
  inventory_count: 5,
  image_urls: ['https://images.unsplash.com/a', 'https://images.unsplash.com/b'],
}

describe('serializeJsonLd', () => {
  it('cannot be used to close the script tag', () => {
    const out = serializeJsonLd({ name: 'Lamp</script><script>alert(1)</script>' })
    expect(out).not.toContain('<')
    expect(JSON.parse(out).name).toBe('Lamp</script><script>alert(1)</script>')
  })
})

describe('productJsonLd', () => {
  it('describes the product and its offer', () => {
    const data = productJsonLd(product, { siteUrl: SITE, category: 'Electronics' })
    expect(data).toMatchObject({
      '@type': 'Product',
      name: 'Wireless Headphones',
      url: 'https://shop.example/product/wireless-headphones',
      image: product.image_urls,
      category: 'Electronics',
      offers: {
        priceCurrency: 'EUR',
        price: '299.99',
        availability: 'https://schema.org/InStock',
      },
    })
    expect(data).toMatchObject({
      offers: {
        shippingDetails: { shippingRate: { value: 0 } },
        hasMerchantReturnPolicy: { merchantReturnDays: 30 },
      },
    })
  })

  it('says out of stock when it is', () => {
    expect(productJsonLd({ ...product, inventory_count: 0 }, { siteUrl: SITE })).toMatchObject({
      offers: { availability: 'https://schema.org/OutOfStock' },
    })
  })

  it('claims a rating only when there are reviews', () => {
    expect(productJsonLd(product, { siteUrl: SITE })).not.toHaveProperty('aggregateRating')
    expect(productJsonLd(product, { siteUrl: SITE, ratings: [5, 4, 4] })).toMatchObject({
      aggregateRating: { ratingValue: 4.3, reviewCount: 3 },
    })
  })

  it('leaves out what the product does not have', () => {
    const bare = productJsonLd({ ...product, description: null, image_urls: [] }, { siteUrl: SITE })
    expect(bare).not.toHaveProperty('description')
    expect(bare).not.toHaveProperty('image')
    expect(bare).not.toHaveProperty('brand')
  })
})

describe('breadcrumbJsonLd', () => {
  it('lists the trail with absolute URLs, starting at 1', () => {
    expect(
      breadcrumbJsonLd(
        [
          { name: 'Home', path: '/' },
          { name: 'Electronics', path: '/categories/electronics' },
        ],
        SITE,
      ),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://shop.example/' },
        { '@type': 'ListItem', position: 2, name: 'Electronics', item: 'https://shop.example/categories/electronics' },
      ],
    })
  })
})
