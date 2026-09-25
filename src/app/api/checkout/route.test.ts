import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
// stock_reservations.update(...).eq('id', …): links the reservation to its session.
const linkEq = vi.fn()
const linkUpdate = vi.fn(() => ({ eq: linkEq }))
vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({ rpc, from: () => ({ update: linkUpdate }) }),
}))

process.env.STRIPE_SECRET_KEY = 'sk_test_x'
const { POST } = await import('./route')

const checkout = (quantity = 1) =>
  POST(
    new Request('http://shop.test/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://shop.test', 'x-real-ip': '203.0.113.7' },
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
  createSession.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.test/pay' })
  linkEq.mockResolvedValue({ error: null })
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

  it("links the session to the reservation, so Stripe's back link can release it", async () => {
    await checkout()

    expect(createSession.mock.calls[0][0].cancel_url).toBe(`http://shop.test/cart?cancelled=${RESERVATION}`)
    expect(linkUpdate).toHaveBeenCalledWith({ stripe_session_id: 'cs_test_1' })
    expect(linkEq).toHaveBeenCalledWith('id', RESERVATION)
  })

  it('still sends the shopper to pay when the link cannot be saved', async () => {
    linkEq.mockResolvedValue({ error: { code: 'PGRST204', message: 'column not found' } })
    const res = await checkout()

    expect(res.status).toBe(200)
    expect(rpc).not.toHaveBeenCalledWith('release_reservation', expect.anything())
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

  it('refuses more units of one item than an order may hold', async () => {
    const res = await checkout(11)

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('At most 10')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('POST /api/checkout limits', () => {
  const limiter = (allowed: boolean | 'error') =>
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'rate_limit_hit') {
        return allowed === 'error'
          ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
          : { data: allowed, error: null }
      }
      return fn === 'reserve_stock' ? { data: RESERVATION, error: null } : { data: true, error: null }
    })

  beforeEach(() => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('stops a flood before reading, reserving or reaching Stripe', async () => {
    limiter(false)
    const res = await checkout()

    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(productRows).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith('reserve_stock', expect.anything())
    expect(createSession).not.toHaveBeenCalled()
  })

  it('caps how many checkouts one shopper holds open, keyed without the raw IP', async () => {
    limiter(true)
    const res = await checkout()

    expect(res.status).toBe(200)
    const [, args] = rpc.mock.calls.find(([fn]) => fn === 'reserve_stock')!
    expect(args.p_max_held).toBe(3)
    expect(typeof args.p_owner_key).toBe('string')
    expect(args.p_owner_key).not.toContain('203.0.113.7')
  })

  it('refuses a fourth open checkout without reaching Stripe', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'reserve_stock'
        ? { data: null, error: { message: 'too_many_reservations' } }
        : { data: true, error: null },
    )
    const res = await checkout()

    expect(res.status).toBe(429)
    expect((await res.json()).error).toContain('checkouts open')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('keeps selling when the limiter itself is unavailable', async () => {
    limiter('error')
    const res = await checkout()

    expect(res.status).toBe(200)
    expect(createSession).toHaveBeenCalled()
  })
})

describe('POST /api/checkout with sizes', () => {
  const SIZE_M = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

  beforeEach(() => {
    productRows.mockResolvedValue({
      data: [
        {
          id: PRODUCT,
          title: 'Shirt',
          price: 25,
          image_urls: [],
          inventory_count: 7,
          variants: [{ id: SIZE_M, size: 'M', inventory_count: 5 }],
        },
      ],
      error: null,
    })
  })

  const checkoutSized = (variantId: string | null) =>
    POST(
      new Request('http://shop.test/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'http://shop.test' },
        body: JSON.stringify({ items: [{ id: PRODUCT, variantId, quantity: 1 }] }),
      }),
    )

  it('reserves the chosen size and names it on the Stripe line', async () => {
    const res = await checkoutSized(SIZE_M)

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('reserve_stock', {
      p_items: [{ product_id: PRODUCT, quantity: 1, variant_id: SIZE_M }],
      p_ttl_seconds: expect.any(Number),
    })
    const line = createSession.mock.calls[0][0].line_items[0]
    expect(line.price_data.product_data.name).toBe('Shirt — size M')
    expect(line.price_data.product_data.metadata).toEqual({
      product_id: PRODUCT,
      variant_id: SIZE_M,
      variant_label: 'M',
    })
  })

  it('refuses a sized product without a size, before reserving anything', async () => {
    const res = await checkoutSized(null)

    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('Choose a size')
    expect(rpc).not.toHaveBeenCalled()
  })
})
