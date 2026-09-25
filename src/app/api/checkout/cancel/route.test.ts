import { describe, it, expect, vi, beforeEach } from 'vitest'

const expireSession = vi.fn()
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(function () {
    return { checkout: { sessions: { expire: expireSession } } }
  }),
}))

const RESERVATION = '0b8e7c6d-5a4f-4e3d-9c2b-1a0f9e8d7c6b'

// stock_reservations.select(...).eq('id', …).maybeSingle()
const readReservation = vi.fn()
const rpc = vi.fn()
vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: readReservation }) }) }),
  }),
}))

process.env.STRIPE_SECRET_KEY = 'sk_test_x'
const { POST } = await import('./route')

const cancel = (body: unknown = { reservationId: RESERVATION }) =>
  POST(
    new Request('http://shop.test/api/checkout/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  readReservation.mockResolvedValue({ data: { status: 'held', stripe_session_id: 'cs_test_1' }, error: null })
  expireSession.mockResolvedValue({ id: 'cs_test_1', status: 'expired' })
  rpc.mockResolvedValue({ data: true, error: null })
})

describe('POST /api/checkout/cancel', () => {
  it('closes the Stripe session, then puts the units back', async () => {
    const res = await cancel()

    expect(await res.json()).toEqual({ released: true })
    expect(expireSession).toHaveBeenCalledWith('cs_test_1')
    expect(rpc).toHaveBeenCalledWith('release_reservation', { p_reservation_id: RESERVATION })
    expect(expireSession.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0])
  })

  it('never releases units whose session Stripe will not close (paid in another tab)', async () => {
    expireSession.mockRejectedValue(new Error('Only Checkout Sessions with a status of open can be expired'))
    const res = await cancel()

    expect(await res.json()).toEqual({ released: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does nothing for a reservation that is no longer held', async () => {
    readReservation.mockResolvedValue({ data: { status: 'converted', stripe_session_id: 'cs_test_1' }, error: null })
    expect(await (await cancel()).json()).toEqual({ released: false })
    expect(expireSession).not.toHaveBeenCalled()
  })

  it('does nothing for an unknown reservation or one never linked to a session', async () => {
    readReservation.mockResolvedValue({ data: null, error: null })
    expect(await (await cancel()).json()).toEqual({ released: false })

    readReservation.mockResolvedValue({ data: { status: 'held', stripe_session_id: null }, error: null })
    expect(await (await cancel()).json()).toEqual({ released: false })
    expect(expireSession).not.toHaveBeenCalled()
  })

  it('rejects anything that is not a reservation id', async () => {
    const res = await cancel({ reservationId: "1' or 1=1" })
    expect(res.status).toBe(400)
    expect(readReservation).not.toHaveBeenCalled()
  })

  it('leaves a failed release to the expired webhook and says nothing about why', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset by peer' } })
    const res = await cancel()

    expect(await res.json()).toEqual({ released: false })
  })
})
