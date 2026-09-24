import { describe, it, expect } from 'vitest'
import { isAllowedImageUrl, orderStatusSchema, parseProductForm, slugify } from './admin-schemas'

const SUPABASE = 'https://abc123.supabase.co'
const STORAGE = `${SUPABASE}/storage/v1/object/public/product-images/products/1.webp`

describe('isAllowedImageUrl', () => {
  it.each([
    ['https://images.unsplash.com/photo-1?w=800', true],
    ['https://placehold.co/400x400', true],
    [STORAGE, true],
    // Same project, different (private) bucket.
    [`${SUPABASE}/storage/v1/object/public/avatars/me.png`, false],
    // Another project's bucket.
    ['https://evil.supabase.co/storage/v1/object/public/product-images/x.png', false],
    ['http://images.unsplash.com/photo-1', false],
    ['https://example.com/cat.jpg', false],
    ['not a url', false],
  ])('%s -> %s', (url, allowed) => {
    expect(isAllowedImageUrl(url, SUPABASE)).toBe(allowed)
  })

  it('rejects storage URLs when Supabase is not configured', () => {
    expect(isAllowedImageUrl(STORAGE, '')).toBe(false)
  })
})

function form(fields: Record<string, string | string[]>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v)
  }
  return data
}

const valid = {
  title: '  Desk Lamp ',
  description: 'Warm light.',
  price: '39.90',
  inventory_count: '12',
  category_id: '33333333-3333-3333-3333-333333333333',
}

describe('parseProductForm', () => {
  it('coerces numbers, trims text and keeps image order', () => {
    const result = parseProductForm(
      form({
        ...valid,
        image_urls: ['https://images.unsplash.com/b', 'https://images.unsplash.com/a'],
      }),
    )
    expect(result.success && result.data).toEqual({
      title: 'Desk Lamp',
      description: 'Warm light.',
      price: 39.9,
      inventory_count: 12,
      category_id: valid.category_id,
      image_urls: ['https://images.unsplash.com/b', 'https://images.unsplash.com/a'],
    })
  })

  it('drops blank and duplicate image entries', () => {
    const result = parseProductForm(
      form({ ...valid, image_urls: ['https://images.unsplash.com/a', '', 'https://images.unsplash.com/a'] }),
    )
    expect(result.success && result.data.image_urls).toEqual(['https://images.unsplash.com/a'])
  })

  it.each([
    ['a negative price', { price: '-1' }],
    ['a non-numeric price', { price: 'free' }],
    ['fractional stock', { inventory_count: '1.5' }],
    ['a missing category', { category_id: '' }],
    ['a one-letter title', { title: 'A' }],
    ['an image from an unknown host', { image_urls: 'https://example.com/x.jpg' }],
  ])('rejects %s', (_, override) => {
    expect(parseProductForm(form({ ...valid, ...override })).success).toBe(false)
  })

  it('accepts a free product', () => {
    expect(parseProductForm(form({ ...valid, price: '0' })).success).toBe(true)
  })
})

describe('orderStatusSchema', () => {
  it('accepts the statuses the database allows, and nothing else', () => {
    expect(orderStatusSchema.safeParse('shipped').success).toBe(true)
    expect(orderStatusSchema.safeParse('lost').success).toBe(false)
  })
})

describe('slugify', () => {
  it('makes URL-safe slugs', () => {
    expect(slugify('Café Crème — 2 Pack!')).toBe('cafe-creme-2-pack')
  })
})
