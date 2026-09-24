import { describe, it, expect } from 'vitest'
import {
  rankProducts,
  tokenize,
  stem,
  extractMaxPrice,
  removeBudget,
  type SearchableProduct,
} from './search'

const CATEGORIES = {
  electronics: 'cat-electronics',
  clothing: 'cat-clothing',
  'smart-home': 'cat-smart-home',
}

function product(overrides: Partial<SearchableProduct> & { id: string }): SearchableProduct {
  return {
    title: 'Untitled',
    slug: overrides.id,
    description: null,
    price: 10,
    category_id: null,
    image_urls: [],
    attributes: null,
    ...overrides,
  }
}

const CATALOGUE: SearchableProduct[] = [
  product({
    id: 'headphones',
    title: 'Wireless Noise-Canceling Headphones',
    description: 'Premium noise-canceling headphones with 30-hour battery life.',
    price: 299.99,
    category_id: CATEGORIES.electronics,
    attributes: { color: 'Black', connectivity: 'Bluetooth 5.2' },
  }),
  product({
    id: 'earbuds',
    title: 'Compact Bluetooth Earbuds',
    description: 'True-wireless earbuds with a pocketable charging case.',
    price: 79,
    category_id: CATEGORIES.electronics,
    attributes: { color: 'White' },
  }),
  product({
    id: 'sweater',
    title: 'Merino Wool Sweater',
    description: 'Fine-knit merino wool sweater for cold evenings.',
    price: 119,
    category_id: CATEGORIES.clothing,
    attributes: { color: 'Red', season: 'winter' },
  }),
  product({
    id: 'bulb',
    title: 'RGB Smart Light Bulb',
    description: 'Dimmable colour bulb controlled from your phone.',
    price: 19.9,
    category_id: CATEGORIES['smart-home'],
    attributes: { color: 'Multicolour' },
  }),
  product({
    id: 'thermostat',
    title: 'Wi-Fi Smart Thermostat',
    description: 'Energy-saving thermostat that learns your habits.',
    price: 199,
    category_id: CATEGORIES['smart-home'],
  }),
]

const rank = (query: string) =>
  rankProducts(query, CATALOGUE, { categorySlugToId: CATEGORIES }).map((r) => r.product.id)

describe('stem', () => {
  it('folds regular plurals onto their singular', () => {
    expect(stem('headphones')).toBe(stem('headphone'))
    expect(stem('bulbs')).toBe(stem('bulb'))
  })

  it('leaves short words and double-s endings alone', () => {
    expect(stem('gas')).toBe('gas')
    expect(stem('dress')).toBe('dress')
  })
})

describe('tokenize', () => {
  it('drops stop words and single characters', () => {
    expect(tokenize('a red sweater for the winter')).toEqual(['red', 'sweater', 'winter'])
  })

  it('handles punctuation and mixed case', () => {
    expect(tokenize('Wi-Fi, SMART thermostat!')).toEqual(['wi', 'fi', 'smart', 'thermostat'])
  })

  it('returns nothing for a query made only of noise', () => {
    expect(tokenize('the and for')).toEqual([])
  })
})

describe('extractMaxPrice', () => {
  it.each([
    ['headphones under 200', 200],
    ['sweater below $150', 150],
    ['bulb < 25', 25],
    ['smart home до 60', 60],
    ['speaker up to 49.99', 49.99],
  ])('parses %s', (query, expected) => {
    expect(extractMaxPrice(query)).toBe(expected)
  })

  it('returns null when no budget is mentioned', () => {
    expect(extractMaxPrice('wireless headphones')).toBeNull()
  })

  it('accepts a euro sign', () => {
    expect(extractMaxPrice('sweater under €120')).toBe(120)
  })
})

describe('removeBudget', () => {
  it.each([
    ['smart home under 60', 'smart home'],
    ['warm sweater below €150 please', 'warm sweater please'],
    ['bulb < 25', 'bulb'],
    ['подарок до 50 евро', 'подарок'],
    ['wireless headphones', 'wireless headphones'],
  ])('%s -> %s', (query, expected) => {
    expect(removeBudget(query)).toBe(expected)
  })
})

describe('rankProducts', () => {
  it('puts the title match first', () => {
    expect(rank('headphones')[0]).toBe('headphones')
  })

  it('matches singular and plural forms alike', () => {
    expect(rank('headphone')).toContain('headphones')
  })

  it('ranks a product matching every term above one matching a single term', () => {
    const results = rank('merino wool sweater')
    expect(results[0]).toBe('sweater')
  })

  it('applies a budget mentioned in the query', () => {
    const results = rank('smart under 100')
    expect(results).toContain('bulb')
    expect(results).not.toContain('thermostat') // €199, over budget
  })

  it('returns an empty list rather than inventing a result', () => {
    // The old implementation pushed a random product when nothing matched.
    expect(rank('scuba diving regulator')).toEqual([])
  })

  it('ignores an empty or stop-word-only query', () => {
    expect(rank('')).toEqual([])
    expect(rank('the and')).toEqual([])
  })

  it('searches attributes, not just title and description', () => {
    expect(rank('red')).toContain('sweater')
  })

  it('reports which terms actually matched', () => {
    const [top] = rankProducts('bluetooth earbuds', CATALOGUE, {
      categorySlugToId: CATEGORIES,
    })
    expect(top.product.id).toBe('earbuds')
    expect(top.matchedTerms.sort()).toEqual(['bluetooth', 'earbud'])
  })

  it('respects the result limit', () => {
    const results = rankProducts('smart', CATALOGUE, {
      categorySlugToId: CATEGORIES,
      limit: 1,
    })
    expect(results).toHaveLength(1)
  })

  it('is stable for equally scoring products', () => {
    const first = rank('smart')
    const second = rank('smart')
    expect(first).toEqual(second)
  })
})
