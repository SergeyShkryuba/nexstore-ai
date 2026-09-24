import { describe, it, expect } from 'vitest'
import { fuseResults } from './hybrid'
import type { ScoredProduct, SearchableProduct } from './search'

function product(id: string, price = 50): SearchableProduct {
  return {
    id,
    title: id,
    slug: id,
    description: null,
    price,
    category_id: null,
    image_urls: [],
  }
}

const CATALOGUE = [product('speaker', 49.99), product('bulb', 19.9), product('sweater', 119)]

const lexical = (...ids: string[]): ScoredProduct[] =>
  ids.map((id, i) => ({ product: CATALOGUE.find((p) => p.id === id)!, score: 10 - i, matchedTerms: ['x'] }))

const options = { maxPrice: null, minSimilarity: 0.8 }

describe('fuseResults', () => {
  it('ranks a product both rankers found above one found by either alone', () => {
    const results = fuseResults(
      lexical('bulb', 'speaker'),
      [
        { id: 'speaker', similarity: 0.9 },
        { id: 'sweater', similarity: 0.85 },
      ],
      CATALOGUE,
      options,
    )
    expect(results.map((r) => r.product.id)).toEqual(['speaker', 'bulb', 'sweater'])
  })

  it('keeps matched terms from the lexical ranker and adds the similarity', () => {
    const [speaker] = fuseResults(lexical('speaker'), [{ id: 'speaker', similarity: 0.91234 }], CATALOGUE, options)
    expect(speaker.matchedTerms).toEqual(['x'])
    expect(speaker.similarity).toBe(0.9123)
  })

  it('marks semantic-only results with no matched terms', () => {
    const [sweater] = fuseResults([], [{ id: 'sweater', similarity: 0.88 }], CATALOGUE, options)
    expect(sweater.matchedTerms).toEqual([])
    expect(sweater.similarity).toBe(0.88)
  })

  it('drops semantic matches below the similarity cut-off', () => {
    const results = fuseResults([], [{ id: 'sweater', similarity: 0.79 }], CATALOGUE, options)
    expect(results).toEqual([])
  })

  it('drops matches too far below the best one', () => {
    const results = fuseResults(
      [],
      [
        { id: 'speaker', similarity: 0.92 },
        { id: 'bulb', similarity: 0.88 },
        { id: 'sweater', similarity: 0.81 },
      ],
      CATALOGUE,
      { ...options, maxGap: 0.05 },
    )
    expect(results.map((r) => r.product.id)).toEqual(['speaker', 'bulb'])
  })

  it('measures the gap from the best match even when it is over budget', () => {
    const results = fuseResults(
      [],
      [
        { id: 'sweater', similarity: 0.95 },
        { id: 'bulb', similarity: 0.85 },
      ],
      CATALOGUE,
      { ...options, maxGap: 0.05, maxPrice: 60 },
    )
    expect(results).toEqual([])
  })

  it('applies the budget to semantic matches too', () => {
    const results = fuseResults(
      [],
      [
        { id: 'sweater', similarity: 0.95 },
        { id: 'bulb', similarity: 0.9 },
      ],
      CATALOGUE,
      { ...options, maxPrice: 60 },
    )
    expect(results.map((r) => r.product.id)).toEqual(['bulb'])
  })

  it('ignores matches for products that are not in the catalogue', () => {
    expect(fuseResults([], [{ id: 'deleted', similarity: 0.99 }], CATALOGUE, options)).toEqual([])
  })

  it('returns the lexical order unchanged when there are no semantic matches', () => {
    const results = fuseResults(lexical('sweater', 'bulb'), [], CATALOGUE, options)
    expect(results.map((r) => r.product.id)).toEqual(['sweater', 'bulb'])
    expect(results.every((r) => r.similarity === null)).toBe(true)
  })
})
