// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleUpdate, menuActionOf, parseOrderLookup, type BotDeps, type TgMessage, type TgUpdate } from './bot'

const earbuds = { slug: 'earbuds', title: 'Compact Bluetooth Earbuds', price: 79, inventory_count: 3 }
const camera = { slug: 'camera', title: '4K Action Camera', price: 199, inventory_count: 0 }

function fakeDeps(overrides: Partial<BotDeps> = {}) {
  const sent: Array<{ method: string; payload: Record<string, unknown> }> = []
  const deps: BotDeps = {
    send: vi.fn(async (method, payload) => {
      sent.push({ method, payload })
    }),
    siteUrl: 'https://shop.test',
    search: vi.fn(async () => ({ maxPrice: null, products: [earbuds, camera] })),
    categories: vi.fn(async () => [{ slug: 'electronics', name: 'Электроника' }]),
    categoryProducts: vi.fn(async () => [earbuds]),
    findOrder: vi.fn(async () => null),
    saveSupport: vi.fn(async () => {}),
    allow: vi.fn(async () => true),
    ...overrides,
  }
  return { deps, sent }
}

let nextId = 1
const message = (text: string, extra: Partial<TgMessage> = {}): TgUpdate => ({
  update_id: nextId++,
  message: {
    message_id: nextId,
    chat: { id: 42, type: 'private' },
    from: { id: 7, username: 'ana', language_code: 'ru' },
    text,
    ...extra,
  },
})
const replyTo = (question: string, text: string) =>
  message(text, { reply_to_message: { text: question, from: { id: 1, is_bot: true } } })

const textOf = (sent: ReturnType<typeof fakeDeps>['sent']) => sent.map((s) => String(s.payload.text ?? '')).join('\n---\n')

beforeEach(() => {
  nextId = 1
})

describe('Telegram bot', () => {
  it('greets with the menu keyboard in the user’s language', async () => {
    const { deps, sent } = fakeDeps()
    await handleUpdate(message('/start'), deps)
    expect(sent[0].payload.text).toContain('Привет')
    const keyboard = (sent[0].payload.reply_markup as { keyboard: Array<Array<{ text: string }>> }).keyboard
    expect(keyboard.flat().map((b) => b.text)).toContain('📦 Мои заказы')
  })

  it('searches whatever is typed, in the user’s language, with a link button per product', async () => {
    const { deps, sent } = fakeDeps()
    await handleUpdate(message('наушники до 100'), deps)
    expect(deps.search).toHaveBeenCalledWith('наушники до 100', 'ru')
    expect(sent[0].payload.text).toContain('1. Compact Bluetooth Earbuds — 79,00')
    expect(sent[0].payload.text).toContain('(Нет в наличии)')
    const buttons = (sent[0].payload.reply_markup as { inline_keyboard: Array<Array<{ url: string }>> }).inline_keyboard
    expect(buttons[0][0].url).toBe('https://shop.test/ru/product/earbuds')
  })

  it('sends no link buttons without a public https address', async () => {
    const { deps, sent } = fakeDeps({ siteUrl: null })
    await handleUpdate(message('наушники'), deps)
    expect(sent[0].payload.reply_markup).toBeUndefined()
  })

  it('opens the catalogue by category and lists a category’s products', async () => {
    const { deps, sent } = fakeDeps()
    await handleUpdate(message('🗂 Каталог'), deps)
    expect(sent[0].payload.reply_markup).toEqual({
      inline_keyboard: [[{ text: 'Электроника', callback_data: 'cat:electronics' }]],
    })

    await handleUpdate(
      {
        update_id: 99,
        callback_query: {
          id: 'cb1',
          from: { id: 7, language_code: 'ru' },
          data: 'cat:electronics',
          message: { chat: { id: 42, type: 'private' } },
        },
      },
      deps,
    )
    expect(sent[1]).toEqual({ method: 'answerCallbackQuery', payload: { callback_query_id: 'cb1' } })
    expect(deps.categoryProducts).toHaveBeenCalledWith('electronics', 'ru')
    expect(sent[2].payload.text).toContain('Электроника:')
  })

  it('answers menu buttons pressed in another language too', () => {
    expect(menuActionOf('📦 My orders')).toBe('orders')
    expect(menuActionOf('🚚 Envíos y devoluciones')).toBe('shipping')
    expect(menuActionOf('hello')).toBeNull()
  })

  it('asks for the order number and email, then shows only an order that matches both', async () => {
    const { deps, sent } = fakeDeps({
      findOrder: vi.fn(async () => ({
        id: '3f9a1c2b-0000-0000-0000-000000000000',
        created_at: '2026-09-20T10:00:00Z',
        status: 'shipped',
        total: 59.9,
        itemCount: 2,
      })),
    })
    await handleUpdate(message('📦 Мои заказы'), deps)
    expect(sent[0].payload.reply_markup).toEqual({ force_reply: true })
    const question = String(sent[0].payload.text)

    await handleUpdate(replyTo(question, '#3F9A1C2B, Ana@Example.com'), deps)
    expect(deps.allow).toHaveBeenCalledWith('orderLookup', 42)
    expect(deps.findOrder).toHaveBeenCalledWith('3f9a1c2b', 'ana@example.com')
    expect(sent[1].payload.text).toContain('Заказ #3f9a1c2b')
    expect(sent[1].payload.text).toContain('Статус: Отправлен')
  })

  it('stops order lookups past the limit', async () => {
    const { deps, sent } = fakeDeps({ allow: vi.fn(async () => false) })
    await handleUpdate(message('📦 Мои заказы'), deps)
    await handleUpdate(replyTo(String(sent[0].payload.text), '3f9a1c2b ana@example.com'), deps)
    expect(deps.findOrder).not.toHaveBeenCalled()
    expect(sent[1].payload.text).toContain('Слишком много запросов')
  })

  it('files a message to the team once it carries an email', async () => {
    const { deps, sent } = fakeDeps()
    await handleUpdate(message('🙋 Связаться с нами'), deps)
    const question = String(sent[0].payload.text)

    await handleUpdate(replyTo(question, 'Посылка повреждена'), deps)
    expect(deps.saveSupport).not.toHaveBeenCalled()
    expect(sent[1].payload.reply_markup).toEqual({ force_reply: true })

    await handleUpdate(replyTo(String(sent[1].payload.text), 'Посылка повреждена, ana@example.com'), deps)
    expect(deps.saveSupport).toHaveBeenCalledWith({
      email: 'ana@example.com',
      message: 'Посылка повреждена, ana@example.com',
      summary: 'Sent from Telegram by @ana (chat 42).',
      locale: 'ru',
    })
    expect(sent[2].payload.text).toContain('ana@example.com')
  })

  it('uses the AI for typed text when it is configured', async () => {
    const ai = vi.fn(async () => ({ text: 'Вот наушники до 100 €.', products: [earbuds], handoff: false }))
    const { deps, sent } = fakeDeps({ ai })
    await handleUpdate(message('что-нибудь послушать до 100'), deps)
    expect(ai).toHaveBeenCalledWith('что-нибудь послушать до 100', 'ru')
    expect(deps.search).not.toHaveBeenCalled()
    expect(textOf(sent)).toContain('Вот наушники до 100 €.')
  })

  it('ignores groups and other bots', async () => {
    const { deps, sent } = fakeDeps()
    await handleUpdate(message('hi', { chat: { id: -100, type: 'group' } }), deps)
    await handleUpdate(message('hi', { from: { id: 9, is_bot: true } }), deps)
    expect(sent).toHaveLength(0)
  })
})

describe('parseOrderLookup', () => {
  it('reads the number and email in any order and format', () => {
    expect(parseOrderLookup('ana@example.com 3f9a1c2b')).toEqual({ ref: '3f9a1c2b', email: 'ana@example.com' })
    expect(parseOrderLookup('3f9a1c2b-1111-2222 ana@example.com')).toEqual({ ref: '3f9a1c2b', email: 'ana@example.com' })
    expect(parseOrderLookup('3f9a1c2b')).toBeNull()
    expect(parseOrderLookup('ana@example.com')).toBeNull()
  })
})
