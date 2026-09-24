import { describe, it, expect } from 'vitest'
import {
  applyFilters,
  buildFacets,
  humanizeKey,
  toggleValue,
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

const defaults: CatalogFilters = {
  sort: DEFAULT_SORT,
  minPrice: null,
  maxPrice: null,
  inStock: false,
  sizes: [],
  attributes: {},
}

const ids = (products: CatalogProduct[]) => products.map((p) => p.id)

describe('parseFilters', () => {
  it('returns defaults for an empty query', () => {
    expect(parseFilters(new URLSearchParams())).toEqual(defaults)
  })

  it('reads every filter', () => {
    const filters = parseFilters(new URLSearchParams('sort=price-asc&min=10&max=200&stock=1'))
    expect(filters).toEqual({ ...defaults, sort: 'price-asc', minPrice: 10, maxPrice: 200, inStock: true })
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
    const filters: CatalogFilters = {
      sort: 'name',
      minPrice: 0,
      maxPrice: 50,
      inStock: true,
      sizes: ['M', 'L'],
      attributes: { color: ['Black', 'White'], material: ['Denim'] },
    }
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

const CLOTHES: CatalogProduct[] = [
  {
    id: 'tee',
    title: 'Tee',
    price: 25,
    inventory_count: 5,
    attributes: { color: 'White', material: 'Cotton' },
    variants: [
      { size: 'M', inventory_count: 5 },
      { size: 'L', inventory_count: 0 },
    ],
  },
  {
    id: 'jacket',
    title: 'Jacket',
    price: 90,
    inventory_count: 3,
    attributes: { color: 'Blue', material: 'Denim', fit: 'Regular' },
    variants: [
      { size: 'XL', inventory_count: 1 },
      { size: 'S', inventory_count: 2 },
    ],
  },
  {
    id: 'sweater',
    title: 'Sweater',
    price: 119,
    inventory_count: 4,
    attributes: { color: 'White', material: 'Merino wool' },
    variants: [{ size: 'L', inventory_count: 4 }],
  },
]

describe('size and attribute filters', () => {
  it('reads sizes and attribute values from the URL', () => {
    const filters = parseFilters(new URLSearchParams('size=M&size=L&a.color=White&a.color=Blue&a.material=Denim'))
    expect(filters.sizes).toEqual(['M', 'L'])
    expect(filters.attributes).toEqual({ color: ['White', 'Blue'], material: ['Denim'] })
  })

  it('ignores attribute keys that are not plain words', () => {
    const filters = parseFilters(new URLSearchParams('a.col%20or=White&a.=x&a.colour!=y'))
    expect(filters.attributes).toEqual({})
  })

  it('cannot be used to pollute object prototypes', () => {
    const filters = parseFilters(new URLSearchParams('a.__proto__=polluted&a.constructor=x&a.prototype=y'))
    expect(Object.keys(filters.attributes)).toEqual([])
    expect(Object.getPrototypeOf(filters.attributes)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('matches any selected size, but only one that is in stock', () => {
    expect(ids(applyFilters(CLOTHES, { ...defaults, sizes: ['L'] }))).toEqual(['sweater'])
    expect(ids(applyFilters(CLOTHES, { ...defaults, sizes: ['M', 'S'] })).sort()).toEqual(['jacket', 'tee'])
  })

  it('ORs values within an attribute and ANDs across attributes', () => {
    expect(ids(applyFilters(CLOTHES, { ...defaults, attributes: { color: ['White', 'Blue'] } })).length).toBe(3)
    expect(
      ids(applyFilters(CLOTHES, { ...defaults, attributes: { color: ['White'], material: ['Cotton'] } })),
    ).toEqual(['tee'])
  })

  it('combines sizes and attributes', () => {
    expect(ids(applyFilters(CLOTHES, { ...defaults, sizes: ['L'], attributes: { color: ['Blue'] } }))).toEqual([])
  })
})

describe('buildFacets', () => {
  it('offers sizes in stock, in wearing order, with product counts', () => {
    expect(buildFacets(CLOTHES).sizes).toEqual([
      { value: 'S', count: 1 },
      { value: 'M', count: 1 },
      { value: 'L', count: 1 },
      { value: 'XL', count: 1 },
    ])
  })

  it('offers only attributes that split the list', () => {
    const facets = buildFacets(CLOTHES).attributes
    expect(facets.map((f) => f.key)).toEqual(['color', 'material'])
    expect(facets[0].values).toEqual([
      { value: 'Blue', count: 1 },
      { value: 'White', count: 2 },
    ])
  })

  it('offers nothing for products without sizes or attributes', () => {
    expect(buildFacets([{ id: 'x', title: 'X', price: 1 }])).toEqual({ sizes: [], attributes: [] })
  })
})

describe('helpers', () => {
  it('humanizes attribute keys', () => {
    expect(humanizeKey('voice_assistant')).toBe('Voice assistant')
  })

  it('toggles a value in a list', () => {
    expect(toggleValue(['M'], 'L')).toEqual(['M', 'L'])
    expect(toggleValue(['M', 'L'], 'M')).toEqual(['L'])
  })
})
