// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const hitLimit = vi.fn()
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '1.2.3.4', hitLimit: (...a: unknown[]) => hitLimit(...a) }))
vi.mock('@/utils/supabase/service', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/utils/supabase/public', () => ({ createPublicClient: () => ({}) }))
const getUser = vi.fn()
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }))

const runChat = vi.fn()
vi.mock('@/lib/chat/agent', () => ({
  anthropicModel: () => () => {
    throw new Error('the model is never called in these tests')
  },
  runChat: (...a: unknown[]) => runChat(...a),
}))

const { POST } = await import('./route')
const Anthropic = (await import('@anthropic-ai/sdk')).default

const chat = (body: unknown) =>
  POST(
    new Request('http://shop.test/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const valid = { locale: 'es', messages: [{ role: 'user', content: 'auriculares' }] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  hitLimit.mockResolvedValue({ allowed: true })
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
})

describe('POST /api/chat', () => {
  it('is unavailable without an API key, before counting or reading anything', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const res = await chat(valid)
    expect(res.status).toBe(503)
    expect(hitLimit).not.toHaveBeenCalled()
  })

  it('counts both the burst and the daily limit, and refuses when either is spent', async () => {
    hitLimit.mockImplementation(async (_s: unknown, scope: string) =>
      scope === 'chatDaily' ? { allowed: false, retryAfterSeconds: 3600 } : { allowed: true },
    )
    const res = await chat(valid)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('3600')
    expect(hitLimit.mock.calls.map((c) => c[1])).toEqual(['chat', 'chatDaily'])
    expect((await res.json()).error).toBe('Demasiados mensajes. Espera unos minutos.')
  })

  it('refuses an invalid conversation in the shopper’s language', async () => {
    const res = await chat({ locale: 'ru', messages: [{ role: 'user', content: 'x'.repeat(1001) }] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Сообщение слишком длинное. Сократите его, пожалуйста.')
    expect(runChat).not.toHaveBeenCalled()
  })

  it('streams the reply as NDJSON, with the shopper’s id and language for the tools', async () => {
    runChat.mockImplementation(async ({ emit }) => {
      emit({ type: 'text', text: '¡Hola!' })
      return 'done'
    })
    const res = await chat(valid)

    expect(res.headers.get('Content-Type')).toContain('application/x-ndjson')
    expect((await res.text()).trim().split('\n').map((l) => JSON.parse(l))).toEqual([
      { type: 'text', text: '¡Hola!' },
      { type: 'done' },
    ])
    expect(runChat.mock.calls[0][0].ctx).toMatchObject({ userId: 'user-1', locale: 'es' })
  })

  it('apologises in the shopper’s language when the model declines', async () => {
    runChat.mockResolvedValue('refused')
    const lines = (await (await chat(valid)).text()).trim().split('\n').map((l) => JSON.parse(l))
    expect(lines[0].text).toContain('Lo siento')
  })

  it('reports a busy model by kind only, never the error text', async () => {
    runChat.mockRejectedValue(new Anthropic.RateLimitError(429, { error: { message: 'secret detail' } }, 'rate', new Headers()))
    const text = await (await chat(valid)).text()
    expect(JSON.parse(text.trim())).toEqual({ type: 'error', code: 'busy' })
    expect(text).not.toContain('secret')
  })
})
