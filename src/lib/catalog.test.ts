import { describe, it, expect } from 'vitest'
import {
  applyFilters,
  filtersToParams,
  hasActiveFilters,
  parseFilters,
  DEFAULT_SORT,
  type CatalogFilters,
  type CatalogProduct,
} from './catalog'

const PRODUCTS: CatalogProduct[] = [
  { id: 'a', title: 'Keyboard', price: 129.99, inventory_count: 5, created_at: '2026-01-03' },
  { id: 'b', title: 'bulb', price: '24.50', inventory_count: 0, created_at: '2026-01-01' },
  { id: 'c', title: 'Headphones', price: 299.99, inventory_count: 50, created_at: '2026-01-02' },
]

const defaults: CatalogFilters = { sort: DEFAULT_SORT, minPrice: null, maxPrice: null, inStock: false }

const ids = (products: CatalogProduct[]) => products.map((p) => p.id)

describe('parseFilters', () => {
  it('returns defaults for an empty query', () => {
    expect(parseFilters(new URLSearchParams())).toEqual(defaults)
  })

  it('reads every filter', () => {
    const filters = parseFilters(new URLSearchParams('sort=price-asc&min=10&max=200&stock=1'))
    expect(filters).toEqual({ sort: 'price-asc', minPrice: 10, maxPrice: 200, inStock: true })
  })

  it('ignores malformed values instead of filtering everything out', () => {
    const filters = parseFilters(new URLSearchParams('sort=cheapest&min=abc&max=-5&stock=yes'))
    expect(filters).toEqual(defaults)
  })

  it('swaps a reversed price range', () => {
    const filters = parseFilters(new URLSearchParams('min=300&max=100'))
    expect([filters.minPrice, filters.maxPrice]).toEqual([100, 300])
  })
})

describe('filtersToParams', () => {
  it('omits defaults so the plain URL stays clean', () => {
    expect(filtersToParams(defaults).toString()).toBe('')
    expect(hasActiveFilters(defaults)).toBe(false)
  })

  it('round-trips through parseFilters', () => {
    const filters: CatalogFilters = { sort: 'name', minPrice: 0, maxPrice: 50, inStock: true }
    expect(parseFilters(filtersToParams(filters))).toEqual(filters)
    expect(hasActiveFilters(filters)).toBe(true)
  })
})

describe('applyFilters', () => {
  it('sorts newest first by default', () => {
    expect(ids(applyFilters(PRODUCTS, defaults))).toEqual(['a', 'c', 'b'])
  })

  it('sorts by price, treating string prices as numbers', () => {
    expect(ids(applyFilters(PRODUCTS, { ...defaults, sort: 'price-asc' }))).toEqual(['b', 'a', 'c'])
    expect(ids(applyFilters(PRODUCTS, { ...defaults, sort: 'price-desc' }))).toEqual(['c', 'a', 'b'])
  })

  it('sorts by name case-insensitively', () => {
    expect(ids(applyFilters(PRODUCTS, { ...defaults, sort: 'name' }))).toEqual(['b', 'c', 'a'])
  })

  it('applies an inclusive price range', () => {
    const filtered = applyFilters(PRODUCTS, { ...defaults, minPrice: 24.5, maxPrice: 129.99 })
    expect(ids(filtered).sort()).toEqual(['a', 'b'])
  })

  it('hides sold-out products when asked', () => {
    expect(ids(applyFilters(PRODUCTS, { ...defaults, inStock: true }))).not.toContain('b')
  })

  it('does not mutate the input', () => {
    const before = ids(PRODUCTS)
    applyFilters(PRODUCTS, { ...defaults, sort: 'price-asc' })
    expect(ids(PRODUCTS)).toEqual(before)
  })
})
