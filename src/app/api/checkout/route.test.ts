import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Stripe --------------------------------------------------------------------
const createSession = vi.fn()
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(function () {
    return { checkout: { sessions: { create: createSession } } }
  }),
}))

// --- Supabase: the shopper's client reads products; the service client reserves
const PRODUCT = '00000000-0000-0000-0000-000000000001'
const RESERVATION = '0b8e7c6d-5a4f-4e3d-9c2b-1a0f9e8d7c6b'

const productRows = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ in: productRows }) }),
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}))

const rpc = vi.fn()
vi.mock('@/utils/supabase/service', () => ({ createServiceClient: () => ({ rpc }) }))

process.env.STRIPE_SECRET_KEY = 'sk_test_x'
const { POST } = await import('./route')

const checkout = (quantity = 1) =>
  POST(
    new Request('http://shop.test/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://shop.test' },
      body: JSON.stringify({ items: [{ id: PRODUCT, quantity }] }),
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  productRows.mockResolvedValue({
    data: [{ id: PRODUCT, title: 'Wireless Headphones', price: 299.99, image_urls: [], inventory_count: 5 }],
    error: null,
  })
  rpc.mockImplementation(async (fn: string) =>
    fn === 'reserve_stock' ? { data: RESERVATION, error: null } : { data: true, error: null },
  )
  createSession.mockResolvedValue({ url: 'https://checkout.stripe.test/pay' })
})

describe('POST /api/checkout', () => {
  it('reserves the units, then opens a Stripe session that carries the reservation', async () => {
    const res = await checkout(2)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.test/pay' })
    expect(rpc).toHaveBeenCalledWith('reserve_stock', {
      p_items: [{ product_id: PRODUCT, quantity: 2 }],
      p_ttl_seconds: expect.any(Number),
    })

    const params = createSession.mock.calls[0][0]
    expect(params.metadata).toEqual({ reservation_id: RESERVATION })
    // Stripe requires at least 30 minutes.
    expect(params.expires_at - Date.now() / 1000).toBeGreaterThanOrEqual(30 * 60)
    // The price comes from the database, never from the request.
    expect(params.line_items[0].price_data.unit_amount).toBe(29999)
  })

  it('refuses when someone else took the last units, without reaching Stripe', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'insufficient_stock', details: PRODUCT } })
    const res = await checkout()

    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('Wireless Headphones')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('puts the units back when Stripe cannot open a session', async () => {
    createSession.mockRejectedValue(new Error('Invalid API Key provided: sk_test_abc…'))
    const res = await checkout()

    expect(res.status).toBe(500)
    expect(rpc).toHaveBeenCalledWith('release_reservation', { p_reservation_id: RESERVATION })
    // Stripe's text (which can quote the key) stays out of the response.
    expect(JSON.stringify(await res.json())).not.toContain('sk_test')
  })

  it('still works, unreserved, before schema.sql adds reservations', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    const res = await checkout()

    expect(res.status).toBe(200)
    expect(createSession.mock.calls[0][0].metadata).toBeUndefined()
  })

  it('checks the stock it read before trying to reserve', async () => {
    const res = await checkout(9)

    expect(res.status).toBe(409)
    expect(rpc).not.toHaveBeenCalled()
  })
})
