import { describe, it, expect } from 'vitest'
import { formatPrice, averageRating } from './format'

describe('formatPrice', () => {
  it('formats numbers as euro amounts', () => {
    expect(formatPrice(299.99)).toBe('€299.99')
    expect(formatPrice(0)).toBe('€0.00')
  })

  it('accepts the numeric strings Postgres returns for numeric columns', () => {
    expect(formatPrice('19.90')).toBe('€19.90')
  })

  it('degrades to zero instead of printing NaN', () => {
    expect(formatPrice('not a number')).toBe('€0.00')
  })
})

describe('averageRating', () => {
  it('returns null when there are no reviews', () => {
    expect(averageRating([])).toBeNull()
  })

  it('averages and rounds to one decimal', () => {
    expect(averageRating([5, 4, 4])).toBe(4.3)
    expect(averageRating([5])).toBe(5)
  })
})
