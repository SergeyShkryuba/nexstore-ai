import { describe, it, expect } from 'vitest'
import { createTranslator } from 'next-intl'
import { MESSAGES } from '@/i18n/messages'
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
  const t = createTranslator({ locale: 'en', messages: MESSAGES.en, namespace: 'Stock' })
  const en = (key: 'out' | 'low' | 'in', values: { count: number }) => t(key, values)

  it('shows the exact count only when it is low', () => {
    expect(stockLabel(3, en)).toBe('Only 3 left')
    expect(stockLabel(297, en)).toBe('In stock')
    expect(stockLabel(0, en)).toBe('Out of stock')
    expect(stockLabel(undefined, en)).toBeNull()
  })

  it('is worded in the visitor’s language', () => {
    const ru = createTranslator({ locale: 'ru', messages: MESSAGES.ru, namespace: 'Stock' })
    expect(stockLabel(2, (key, values) => ru(key, values))).toBe('Осталось 2 штуки')
  })
})
