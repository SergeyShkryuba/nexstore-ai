import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Stripe: signature check and line items are stubbed -----------------------
const constructEvent = vi.fn()
const listLineItems = vi.fn()
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(function () {
    return { webhooks: { constructEvent }, checkout: { sessions: { listLineItems } } }
  }),
}))

// --- Supabase: the existing-order lookup and the RPC --------------------------
const maybeSingle = vi.fn()
const rpc = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    rpc,
  }),
}))

// --- Owner alerts: only whether and what is scheduled -------------------------
const notifyOwnerLater = vi.fn()
vi.mock('@/lib/notify', () => ({ notifyOwnerLater: (...a: unknown[]) => notifyOwnerLater(...a) }))
const buildOrderAlert = vi.fn()
vi.mock('@/lib/notify/order-alert', () => ({ buildOrderAlert: (...a: unknown[]) => buildOrderAlert(...a) }))

process.env.STRIPE_SECRET_KEY = 'sk_test_x'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ref.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'

const { POST } = await import('./route')

const USER_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const RESERVATION = '0b8e7c6d-5a4f-4e3d-9c2b-1a0f9e8d7c6b'

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_1',
    payment_status: 'paid',
    amount_total: 5998,
    client_reference_id: USER_ID,
    customer_details: { email: 'ana@example.com', phone: '+34 600', name: 'Ana', address: null },
    collected_information: { shipping_details: { name: 'Ana', address: { city: 'Barcelona', country: 'ES' } } },
    ...overrides,
  }
}

function deliver(type: string, object: unknown) {
  constructEvent.mockReturnValue({ type, data: { object } })
  return POST(
    new Request('http://test/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=x' },
      body: '{}',
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  maybeSingle.mockResolvedValue({ data: null })
  rpc.mockResolvedValue({ data: 'order-1', error: null })
  listLineItems.mockResolvedValue({
    data: [{ quantity: 2, amount_total: 5998, price: { product: { metadata: { product_id: 'p1' } } } }],
  })
})

describe('Stripe webhook', () => {
  it('records a paid session in one transactional call', async () => {
    const res = await deliver('checkout.session.completed', session())

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('record_paid_order', {
      p_session_id: 'cs_test_1',
      p_user_id: USER_ID,
      p_email: 'ana@example.com',
      p_total: 59.98,
      p_shipping: { name: 'Ana', phone: '+34 600', address: { city: 'Barcelona', country: 'ES' } },
      p_items: [{ product_id: 'p1', variant_id: null, variant_label: null, quantity: 2, unit_price: 29.99 }],
      p_reservation_id: null,
    })
  })

  it('passes the checkout reservation on, so the held units become the sale', async () => {
    await deliver('checkout.session.completed', session({ metadata: { reservation_id: RESERVATION } }))
    expect(rpc.mock.calls[0][1].p_reservation_id).toBe(RESERVATION)
  })

  it('keeps the units held while a delayed payment settles', async () => {
    await deliver(
      'checkout.session.completed',
      session({ payment_status: 'unpaid', metadata: { reservation_id: RESERVATION } }),
    )
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('extend_reservation')
    expect(rpc.mock.calls[0][1].p_reservation_id).toBe(RESERVATION)
    expect(new Date(rpc.mock.calls[0][1].p_until).getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000)
  })

  it.each(['checkout.session.expired', 'checkout.session.async_payment_failed'])(
    'puts the units back on %s',
    async (type) => {
      const res = await deliver(type, session({ payment_status: 'unpaid', metadata: { reservation_id: RESERVATION } }))
      expect(res.status).toBe(200)
      expect(rpc).toHaveBeenCalledWith('release_reservation', { p_reservation_id: RESERVATION })
    },
  )

  it('has nothing to release for a session without a reservation', async () => {
    await deliver('checkout.session.expired', session({ payment_status: 'unpaid' }))
    expect(rpc).not.toHaveBeenCalled()
  })

  it('asks Stripe to retry when releasing fails, rather than losing the units', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    const res = await deliver('checkout.session.expired', session({ metadata: { reservation_id: RESERVATION } }))
    expect(res.status).toBe(500)
  })

  it('waits for delayed payment methods, then records on async success', async () => {
    await deliver('checkout.session.completed', session({ payment_status: 'unpaid' }))
    // No reservation on this session, so nothing to extend either.
    expect(rpc).not.toHaveBeenCalled()

    await deliver('checkout.session.async_payment_succeeded', session())
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('does nothing for a session that is already recorded', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'order-1' } })
    const res = await deliver('checkout.session.completed', session())

    expect(res.status).toBe(200)
    expect(listLineItems).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers 500 when recording fails, so Stripe retries', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'deadlock detected' } })
    const res = await deliver('checkout.session.completed', session())

    expect(res.status).toBe(500)
    // The database's message stays in the server log, not the response.
    expect(await res.json()).toEqual({ error: 'Failed to process event' })
  })

  it('drops a client_reference_id that is not an id instead of failing forever', async () => {
    await deliver('checkout.session.completed', session({ client_reference_id: 'not-a-uuid' }))
    expect(rpc.mock.calls[0][1].p_user_id).toBeNull()
  })

  it('rejects a bad signature without touching the database', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature')
    })
    const res = await POST(
      new Request('http://test/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'forged' },
        body: '{}',
      }),
    )
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('ignores unrelated events', async () => {
    const res = await deliver('payment_intent.created', {})
    expect(res.status).toBe(200)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('owner alerts', () => {
  it('announces a newly recorded order once, with the line names from Stripe', async () => {
    listLineItems.mockResolvedValue({
      data: [{ description: 'Merino Sweater', quantity: 2, amount_total: 5998, price: { product: { metadata: { product_id: 'p1' } } } }],
    })
    await deliver('checkout.session.completed', session())

    expect(notifyOwnerLater).toHaveBeenCalledTimes(1)
    await notifyOwnerLater.mock.calls[0][0]()
    expect(buildOrderAlert.mock.calls[0][1]).toMatchObject({
      id: 'order-1',
      total: 59.98,
      email: 'ana@example.com',
      titles: ['Merino Sweater'],
    })
  })

  it('stays quiet when a redelivered event finds the order already recorded', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await deliver('checkout.session.completed', session())
    expect(notifyOwnerLater).not.toHaveBeenCalled()
  })

  it('announces nothing when recording fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'deadlock detected' } })
    await deliver('checkout.session.completed', session())
    expect(notifyOwnerLater).not.toHaveBeenCalled()
  })
})
