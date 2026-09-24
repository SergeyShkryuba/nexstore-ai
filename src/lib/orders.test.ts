import { describe, it, expect } from 'vitest'
import { orderItemsFromLineItems, orderProgress, shippingFromSession, shippingLines } from './orders'

const address = {
  line1: 'Carrer de Mallorca 401',
  line2: '3º 2ª',
  city: 'Barcelona',
  state: 'B',
  postal_code: '08013',
  country: 'ES',
}

describe('shippingFromSession', () => {
  it('reads the collected shipping details and the phone', () => {
    expect(
      shippingFromSession({
        collected_information: { shipping_details: { name: 'Ana García', address } },
        customer_details: { name: 'Billing Name', phone: '+34 600 000 000', address: { country: 'FR' } },
      }),
    ).toEqual({ name: 'Ana García', phone: '+34 600 000 000', address })
  })

  it('falls back to the billing details when no shipping address was collected', () => {
    expect(
      shippingFromSession({
        collected_information: null,
        customer_details: { name: 'Ana', phone: null, address: { country: 'ES' } },
      }),
    ).toEqual({ name: 'Ana', phone: null, address: { country: 'ES' } })
  })

  it('returns null when Stripe collected nothing', () => {
    expect(shippingFromSession({ collected_information: null, customer_details: null })).toBeNull()
  })
})

describe('shippingLines', () => {
  it('formats the current format with a readable country name', () => {
    expect(shippingLines({ name: 'Ana García', phone: '+34 600', address })).toEqual({
      name: 'Ana García',
      phone: '+34 600',
      lines: ['Carrer de Mallorca 401', '3º 2ª', '08013 Barcelona, B', 'Spain'],
    })
  })

  it('reads the bare address older orders stored', () => {
    expect(shippingLines({ line1: 'Hauptstr. 1', city: 'Berlin', postal_code: '10115', country: 'DE' })).toEqual({
      name: null,
      phone: null,
      lines: ['Hauptstr. 1', '10115 Berlin', 'Germany'],
    })
  })

  it('gives nothing for empty or unexpected values', () => {
    expect(shippingLines(null).lines).toEqual([])
    expect(shippingLines('Barcelona').lines).toEqual([])
    expect(shippingLines({ name: 'Ana', address: null })).toEqual({ name: 'Ana', phone: null, lines: [] })
  })
})

describe('orderProgress', () => {
  const done = (status: string) => orderProgress(status).steps.filter((s) => s.done).map((s) => s.key)

  it('marks every step up to the current status', () => {
    expect(done('paid')).toEqual(['paid'])
    expect(done('shipped')).toEqual(['paid', 'shipped'])
    expect(done('delivered')).toEqual(['paid', 'shipped', 'delivered'])
    expect(done('pending')).toEqual([])
  })

  it('reports cancellation and refunds as outcomes, with no progress', () => {
    expect(orderProgress('refunded')).toMatchObject({ outcome: 'refunded' })
    expect(done('cancelled')).toEqual([])
  })
})

describe('orderItemsFromLineItems', () => {
  it('links lines to catalogue products and records the unit price paid', () => {
    expect(
      orderItemsFromLineItems([
        { quantity: 2, amount_total: 5998, price: { product: { metadata: { product_id: 'p1' } } } },
        { quantity: 1, amount_total: 1990, price: { product: { metadata: { product_id: 'p2' } } } },
      ]),
    ).toEqual([
      { product_id: 'p1', variant_id: null, variant_label: null, quantity: 2, unit_price: 29.99 },
      { product_id: 'p2', variant_id: null, variant_label: null, quantity: 1, unit_price: 19.9 },
    ])
  })

  it('keeps a paid line whose product cannot be identified', () => {
    expect(
      orderItemsFromLineItems([
        { quantity: 1, amount_total: 500, price: { product: 'prod_unexpanded' } },
        { quantity: 1, amount_total: 700, price: { product: { metadata: null } } },
      ]).map((l) => l.product_id),
    ).toEqual([null, null])
  })

  it('never divides by a missing or zero quantity', () => {
    expect(orderItemsFromLineItems([{ quantity: null, amount_total: 1234, price: null }])).toEqual([
      { product_id: null, variant_id: null, variant_label: null, quantity: 1, unit_price: 12.34 },
    ])
  })
})

describe('orderItemsFromLineItems with a deleted Stripe product', () => {
  it('records the line without a product link', () => {
    expect(
      orderItemsFromLineItems([{ quantity: 1, amount_total: 900, price: { product: { id: 'prod_1', deleted: true } } }]),
    ).toEqual([{ product_id: null, variant_id: null, variant_label: null, quantity: 1, unit_price: 9 }])
  })
})

describe('orderItemsFromLineItems with sizes', () => {
  it('carries the size bought through to the order line', () => {
    expect(
      orderItemsFromLineItems([
        {
          quantity: 1,
          amount_total: 2499,
          price: { product: { metadata: { product_id: 'shirt', variant_id: 'v-m', variant_label: 'M' } } },
        },
      ]),
    ).toEqual([{ product_id: 'shirt', variant_id: 'v-m', variant_label: 'M', quantity: 1, unit_price: 24.99 }])
  })
})
