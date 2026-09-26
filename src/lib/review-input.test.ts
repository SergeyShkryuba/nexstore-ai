import { describe, it, expect } from 'vitest'
import { MAX_REVIEW_LENGTH, parseReviewInput } from './review-input'

const PRODUCT = '00000000-0000-0000-0000-000000000001'

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

describe('parseReviewInput', () => {
  it('accepts a rating with a trimmed comment', () => {
    expect(parseReviewInput(form({ product_id: PRODUCT, rating: '4', comment: '  Solid.  ' }))).toEqual({
      ok: true,
      review: { productId: PRODUCT, rating: 4, comment: 'Solid.' },
    })
  })

  it('stores an empty or missing comment as no comment', () => {
    const empty = parseReviewInput(form({ product_id: PRODUCT, rating: '5', comment: '   ' }))
    const missing = parseReviewInput(form({ product_id: PRODUCT, rating: '5' }))
    expect(empty.ok && empty.review.comment).toBeNull()
    expect(missing.ok && missing.review.comment).toBeNull()
  })

  it('refuses a comment over the cap', () => {
    const result = parseReviewInput(
      form({ product_id: PRODUCT, rating: '5', comment: 'x'.repeat(MAX_REVIEW_LENGTH + 1) }),
    )
    expect(result).toEqual({ ok: false, error: 'tooLong' })
  })

  it('refuses ratings outside 1–5 and non-numbers', () => {
    for (const rating of ['0', '6', '2.5', 'five']) {
      expect(parseReviewInput(form({ product_id: PRODUCT, rating }))).toEqual({ ok: false, error: 'rating' })
    }
  })

  it('refuses a product id that is not an id', () => {
    expect(parseReviewInput(form({ product_id: 'abc', rating: '5' }))).toEqual({ ok: false, error: 'product' })
  })
})
