import { describe, it, expect } from 'vitest'
import { resolveCartLines, type CatalogueProduct } from './checkout-lines'

const lamp: CatalogueProduct = { id: 'lamp', title: 'Lamp', price: '19.90', image_urls: ['https://img/l'], inventory_count: 3 }
const shirt: CatalogueProduct = {
  id: 'shirt',
  title: 'Shirt',
  price: 25,
  image_urls: null,
  inventory_count: 7,
  variants: [
    { id: 'm', size: 'M', inventory_count: 5 },
    { id: 'l', size: 'L', inventory_count: 2 },
  ],
}
const catalogue = [lamp, shirt]

describe('resolveCartLines', () => {
  it('prices every line from the database and keeps the size', () => {
    const result = resolveCartLines(
      [
        { id: 'lamp', quantity: 1 },
        { id: 'shirt', variantId: 'm', quantity: 2 },
      ],
      catalogue,
    )
    expect(result).toEqual({
      ok: true,
      lines: [
        { productId: 'lamp', variantId: null, size: null, title: 'Lamp', unitPrice: 19.9, imageUrl: 'https://img/l', quantity: 1 },
        { productId: 'shirt', variantId: 'm', size: 'M', title: 'Shirt', unitPrice: 25, imageUrl: null, quantity: 2 },
      ],
    })
  })

  it('merges repeated lines before checking stock', () => {
    const result = resolveCartLines(
      [
        { id: 'shirt', variantId: 'l', quantity: 2 },
        { id: 'shirt', variantId: 'l', quantity: 1 },
      ],
      catalogue,
    )
    expect(result).toEqual({ ok: false, status: 409, error: 'Not enough stock for: Shirt (L)' })
  })

  it('treats two sizes of one product as separate lines', () => {
    const result = resolveCartLines(
      [
        { id: 'shirt', variantId: 'm', quantity: 5 },
        { id: 'shirt', variantId: 'l', quantity: 2 },
      ],
      catalogue,
    )
    expect(result.ok && result.lines.map((l) => [l.size, l.quantity])).toEqual([
      ['M', 5],
      ['L', 2],
    ])
  })

  it('refuses a sized product without a size', () => {
    const result = resolveCartLines([{ id: 'shirt', quantity: 1 }], catalogue)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('Choose a size for Shirt')
  })

  it('refuses a size that was removed from the product', () => {
    const result = resolveCartLines([{ id: 'shirt', variantId: 'xl', quantity: 1 }], catalogue)
    expect(!result.ok && result.error).toContain('no longer sold')
  })

  it('refuses a size on a product sold without sizes', () => {
    expect(resolveCartLines([{ id: 'lamp', variantId: 'm', quantity: 1 }], catalogue).ok).toBe(false)
  })

  it('refuses products that no longer exist', () => {
    expect(resolveCartLines([{ id: 'gone', quantity: 1 }], catalogue).ok).toBe(false)
  })

  it('checks stock of the product when there are no sizes', () => {
    expect(resolveCartLines([{ id: 'lamp', quantity: 4 }], catalogue)).toEqual({
      ok: false,
      status: 409,
      error: 'Not enough stock for: Lamp',
    })
  })
})
