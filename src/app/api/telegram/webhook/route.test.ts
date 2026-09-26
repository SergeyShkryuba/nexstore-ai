// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const handleUpdate = vi.fn()
vi.mock('@/lib/telegram/bot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram/bot')>()),
  handleUpdate: (...a: unknown[]) => handleUpdate(...a),
}))
const send = vi.fn()
vi.mock('@/lib/telegram/deps', () => ({ botDeps: () => ({ send }) }))

const { POST } = await import('./route')

const deliver = (body: unknown, secret: string | null = 's3cret') =>
  POST(
    new Request('http://shop.test/api/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}) },
      body: JSON.stringify(body),
    }),
  )

const update = { update_id: 1, message: { message_id: 1, chat: { id: 42, type: 'private' }, from: { id: 7, language_code: 'es' }, text: 'hola' } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.TELEGRAM_BOT_TOKEN = '123:abc'
  process.env.TELEGRAM_WEBHOOK_SECRET = 's3cret'
  send.mockResolvedValue(undefined)
})

describe('POST /api/telegram/webhook', () => {
  it('accepts only requests carrying the secret Telegram was given', async () => {
    expect((await deliver(update, null)).status).toBe(403)
    expect((await deliver(update, 'wrong')).status).toBe(403)
    expect(handleUpdate).not.toHaveBeenCalled()

    expect((await deliver(update)).status).toBe(200)
    expect(handleUpdate).toHaveBeenCalledTimes(1)
  })

  it('is off until the bot is configured', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    expect((await deliver(update)).status).toBe(503)
  })

  it('answers 200 and tells the user in their language when handling fails', async () => {
    handleUpdate.mockRejectedValue(new Error('database down'))
    expect((await deliver(update)).status).toBe(200)
    expect(send).toHaveBeenCalledWith('sendMessage', { chat_id: 42, text: expect.stringContaining('Algo ha fallado') })
  })
})
