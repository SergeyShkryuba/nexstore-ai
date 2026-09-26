import { describe, it, expect, vi, beforeEach } from 'vitest'

const hitLimit = vi.fn()
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '1.2.3.4', hitLimit: (...a: unknown[]) => hitLimit(...a) }))
const insert = vi.fn()
vi.mock('@/utils/supabase/service', () => ({ createServiceClient: () => ({ from: () => ({ insert }) }) }))
const getUser = vi.fn()
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }))

const notifyOwnerLater = vi.fn()
vi.mock('@/lib/notify', () => ({ notifyOwnerLater: (...a: unknown[]) => notifyOwnerLater(...a) }))

const { POST } = await import('./route')

const send = (body: unknown) =>
  POST(
    new Request('http://shop.test/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const valid = {
  locale: 'ru',
  email: 'shopper@example.test',
  message: 'Посылка пришла повреждённой',
  summary: 'Order bbbb2222 arrived damaged',
  transcript: [
    { role: 'user', content: 'Посылка повреждена' },
    { role: 'assistant', content: 'Передам команде.' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  hitLimit.mockResolvedValue({ allowed: true })
  insert.mockResolvedValue({ error: null })
  getUser.mockResolvedValue({ data: { user: null } })
})

describe('POST /api/support', () => {
  it('stores the request with the chat so far', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const res = await send(valid)
    expect(await res.json()).toEqual({ ok: true })
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      email: valid.email,
      message: valid.message,
      summary: valid.summary,
      transcript: valid.transcript,
      locale: 'ru',
    })
  })

  it('tells the owner once the request is saved, and not when it is refused or fails', async () => {
    await send(valid)
    expect(notifyOwnerLater).toHaveBeenCalledWith({
      kind: 'support',
      email: valid.email,
      message: valid.message,
      summary: valid.summary,
    })

    notifyOwnerLater.mockClear()
    await send({ ...valid, email: 'nope' })
    insert.mockResolvedValue({ error: { message: 'down' } })
    await send(valid)
    expect(notifyOwnerLater).not.toHaveBeenCalled()
  })

  it('accepts visitors who are not signed in', async () => {
    await send(valid)
    expect(insert.mock.calls[0][0].user_id).toBeNull()
  })

  it('names a bad email in the shopper’s language, and saves nothing', async () => {
    const res = await send({ ...valid, email: 'not-an-email' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Введите корректный email.')
    expect(insert).not.toHaveBeenCalled()
  })

  it('refuses an empty message or an oversized transcript', async () => {
    expect((await send({ ...valid, message: '  ' })).status).toBe(400)
    const transcript = Array.from({ length: 41 }, () => ({ role: 'user', content: 'x' }))
    expect((await send({ ...valid, transcript })).status).toBe(400)
  })

  it('is rate limited', async () => {
    hitLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 1200 })
    const res = await send(valid)
    expect(res.status).toBe(429)
    expect(hitLimit.mock.calls[0][1]).toBe('support')
    expect(insert).not.toHaveBeenCalled()
  })

  it('does not pass a database error on to the shopper', async () => {
    insert.mockResolvedValue({ error: { message: 'relation "support_requests" does not exist' } })
    const res = await send(valid)
    expect(res.status).toBe(503)
    expect(JSON.stringify(await res.json())).not.toContain('relation')
  })
})
