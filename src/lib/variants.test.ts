import { describe, it, expect } from 'vitest'
import { cartLineKey, parseVariantsField, sortVariants } from './variants'

describe('sortVariants', () => {
  it('keeps the admin’s order, not the alphabet', () => {
    const sorted = sortVariants([
      { size: 'XL', sort_order: 3 },
      { size: 'S', sort_order: 0 },
      { size: 'L', sort_order: 2 },
      { size: 'M', sort_order: 1 },
    ])
    expect(sorted.map((v) => v.size)).toEqual(['S', 'M', 'L', 'XL'])
  })

  it('copes with nothing', () => {
    expect(sortVariants(null)).toEqual([])
  })
})

describe('cartLineKey', () => {
  it('separates sizes of the same product', () => {
    expect(cartLineKey('p1', 'm')).not.toBe(cartLineKey('p1', 'l'))
    expect(cartLineKey('p1')).toBe('p1')
  })
})

describe('parseVariantsField', () => {
  it('reads sizes with stock', () => {
    expect(parseVariantsField('[{"size":" M ","inventory_count":"5"}]')).toEqual({
      success: true,
      data: [{ size: 'M', inventory_count: 5 }],
    })
  })

  it('treats a missing field as "leave sizes alone"', () => {
    expect(parseVariantsField(null)).toEqual({ success: true, data: null })
  })

  it('accepts an empty list (remove all sizes)', () => {
    expect(parseVariantsField('[]')).toEqual({ success: true, data: [] })
  })

  it.each([
    ['the same size twice, in any case', '[{"size":"M","inventory_count":1},{"size":"m","inventory_count":2}]'],
    ['negative stock', '[{"size":"M","inventory_count":-1}]'],
    ['fractional stock', '[{"size":"M","inventory_count":1.5}]'],
    ['an unnamed size', '[{"size":" ","inventory_count":1}]'],
    ['something that is not JSON', 'M,L'],
  ])('refuses %s', (_, raw) => {
    expect(parseVariantsField(raw).success).toBe(false)
  })
})
