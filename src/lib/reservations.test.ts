import { describe, it, expect } from 'vitest'
import {
  CHECKOUT_TTL_SECONDS,
  RESERVATION_TTL_SECONDS,
  heldUnitsByProduct,
  reservationIdFrom,
  shortProductId,
} from './reservations'

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

describe('timing', () => {
  it('meets Stripe’s 30-minute minimum and outlives the session', () => {
    expect(CHECKOUT_TTL_SECONDS).toBeGreaterThanOrEqual(30 * 60)
    expect(RESERVATION_TTL_SECONDS).toBeGreaterThan(CHECKOUT_TTL_SECONDS)
  })
})

describe('reservationIdFrom', () => {
  it('reads the id checkout stored on the session', () => {
    expect(reservationIdFrom({ reservation_id: ID })).toBe(ID)
  })

  it.each([[null], [undefined], [{}], [{ reservation_id: 'abc' }], [{ reservation_id: `${ID}; drop` }]])(
    'ignores %j',
    (metadata) => {
      expect(reservationIdFrom(metadata as Record<string, string> | null)).toBeNull()
    },
  )
})

describe('shortProductId', () => {
  it('names the product reserve_stock ran short on', () => {
    expect(shortProductId({ message: 'insufficient_stock', details: ID })).toBe(ID)
  })

  it('is null for other errors', () => {
    expect(shortProductId({ message: 'deadlock detected', details: ID })).toBeNull()
    expect(shortProductId({ message: 'insufficient_stock', details: null })).toBeNull()
    expect(shortProductId(null)).toBeNull()
  })
})

describe('heldUnitsByProduct', () => {
  it('sums units across open checkouts', () => {
    const held = heldUnitsByProduct([
      { items: [{ product_id: 'a', quantity: 2 }, { product_id: 'b', quantity: 1 }] },
      { items: [{ product_id: 'a', quantity: 1 }] },
    ])
    expect(Object.fromEntries(held)).toEqual({ a: 3, b: 1 })
  })

  it('skips malformed rows instead of throwing', () => {
    expect(heldUnitsByProduct([{ items: null }, { items: [{ product_id: 1, quantity: '2' }] }]).size).toBe(0)
    expect(heldUnitsByProduct(null).size).toBe(0)
  })
})
