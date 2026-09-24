import { describe, it, expect } from 'vitest'
import { LOW_STOCK_THRESHOLD, stockLabel, stockLevel } from './stock'

describe('stockLevel', () => {
  it.each([
    [0, 'out'],
    [-2, 'out'],
    [1, 'low'],
    [LOW_STOCK_THRESHOLD, 'low'],
    [LOW_STOCK_THRESHOLD + 1, 'in'],
  ] as const)('%d units -> %s', (count, level) => {
    expect(stockLevel(count)).toBe(level)
  })

  it('is unknown when stock was not loaded', () => {
    expect(stockLevel(undefined)).toBeNull()
    expect(stockLevel(null)).toBeNull()
    expect(stockLevel(Number.NaN)).toBeNull()
  })
})

describe('stockLabel', () => {
  it('shows the exact count only when it is low', () => {
    expect(stockLabel(3)).toBe('Only 3 left')
    expect(stockLabel(297)).toBe('In stock')
    expect(stockLabel(0)).toBe('Out of stock')
    expect(stockLabel(undefined)).toBeNull()
  })
})
