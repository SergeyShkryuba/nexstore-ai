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

describe('budgets and filler words in Spanish and Russian', () => {
  it.each([
    ['auriculares menos de 60', 60],
    ['algo para el invierno hasta 120 euros', 120],
    ['наушники до 80', 80],
    ['колонка дешевле 50 евро', 50],
  ])('reads the budget in %s', (query, budget) => {
    expect(extractMaxPrice(query)).toBe(budget)
  })

  it('does not read "до" inside a word as a budget', () => {
    expect(extractMaxPrice('подойдёт 5 штук')).toBeNull()
  })

  it('drops filler words so they cannot match product text', () => {
    expect(tokenize('quiero algo para el invierno')).toEqual(['invierno'])
    expect(tokenize('мне нужно что-нибудь тёплое')).toEqual(['тёплое'])
  })
})

describe('the budget phrase is a filter, not search words', () => {
  const catalogue = [
    { id: 'tee', title: 'Cotton T-Shirt', slug: 'tee', description: '100% organic cotton.', price: 25, category_id: null, image_urls: null },
    { id: 'buds', title: 'Bluetooth Earbuds', slug: 'buds', description: 'Wireless earbuds.', price: 79, category_id: null, image_urls: null },
    { id: 'tee-ru', title: 'Хлопковая футболка', slug: 'tee-ru', description: 'Из 100% хлопка.', price: 25, category_id: null, image_urls: null },
    { id: 'speaker-ru', title: 'Умная колонка', slug: 'speaker-ru', description: 'Для управления умным домом.', price: 49, category_id: null, image_urls: null },
    { id: 'buds-ru', title: 'Bluetooth-наушники', slug: 'buds-ru', description: 'Беспроводные наушники.', price: 79, category_id: null, image_urls: null },
  ]
  const ids = (query: string) => rankProducts(query, catalogue).map((r) => r.product.id)

  it('does not match "100" in a description', () => {
    expect(ids('earbuds under 100')).toEqual(['buds'])
  })

  it('does not match "до" as the start of a Russian word', () => {
    expect(ids('наушники до 100')).toEqual(['buds-ru'])
  })

  it('a budget alone is not a query', () => {
    expect(ids('under 100')).toEqual([])
  })
})
