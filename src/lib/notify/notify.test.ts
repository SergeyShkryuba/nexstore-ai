// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/site', () => ({ siteUrl: 'https://shop.test' }))

import { oneLine, telegramText, whatsappParams, type OwnerAlert } from './alerts'
import { telegramConfig, whatsappConfig } from './channels'
import { notifyOwner } from './index'
import { lowStockAfter } from './order-alert'

const order: OwnerAlert = {
  kind: 'order',
  orderId: '3f9a1c2b-1111-2222-3333-444455556666',
  total: 89.9,
  email: 'ana@example.com',
  place: 'Barcelona, ES',
  lines: [
    { title: 'Merino Sweater', quantity: 2, size: 'M' },
    { title: 'Earbuds <Pro>', quantity: 1 },
  ],
  lowStock: [{ title: 'Merino Sweater', size: 'M', left: 1 }],
}

const support: OwnerAlert = {
  kind: 'support',
  email: 'ana@example.com',
  message: 'My parcel\narrived\tdamaged.',
  summary: 'Order 3f9a1c2b arrived damaged',
}

const env = {
  TELEGRAM_BOT_TOKEN: '123:secret-token',
  TELEGRAM_CHAT_ID: '42',
  WHATSAPP_TOKEN: 'EAAG-secret',
  WHATSAPP_PHONE_NUMBER_ID: '1000',
  WHATSAPP_OWNER_NUMBER: '+34 600 111 222',
} as unknown as NodeJS.ProcessEnv

describe('alert wording', () => {
  it('writes an order for Telegram with the shop text escaped', () => {
    const text = telegramText(order, 'https://shop.test/admin')
    expect(text).toContain('<b>New order #3f9a1c2b, €89.90</b>')
    expect(text).toContain('2 × Merino Sweater (M)')
    expect(text).toContain('1 × Earbuds &lt;Pro&gt;')
    expect(text).toContain('⚠️ Low stock: Merino Sweater (M): 1 left')
    expect(text).toContain('<a href="https://shop.test/admin/orders">')
  })

  it('fills the WhatsApp template with single-line values', () => {
    const [title, details] = whatsappParams(support)
    expect(title).toBe('Support request from ana@example.com')
    expect(details).not.toMatch(/[\n\t]| {5,}/)
    expect(details).toContain('Order 3f9a1c2b arrived damaged')

    const [, orderDetails] = whatsappParams(order)
    expect(orderDetails).toBe(
      '2 × Merino Sweater (M); 1 × Earbuds <Pro>. ana@example.com, Barcelona, ES. Low stock: Merino Sweater (M): 1 left.',
    )
  })

  it('clips long values', () => {
    expect(oneLine('x'.repeat(2000))).toHaveLength(900)
  })
})

describe('channel configuration', () => {
  it('needs every value of a channel, and keeps only digits of the phone number', () => {
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: 'x' } as unknown as NodeJS.ProcessEnv)).toBeNull()
    expect(whatsappConfig(env)).toMatchObject({ to: '34600111222', template: 'store_alert', language: 'en' })
  })
})

describe('notifyOwner', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('sends to both messengers', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    expect(await notifyOwner(order, env)).toEqual({ telegram: true, whatsapp: true })

    const [tgUrl, tgInit] = fetchMock.mock.calls.find(([url]) => String(url).includes('telegram'))!
    expect(tgUrl).toBe('https://api.telegram.org/bot123:secret-token/sendMessage')
    expect(JSON.parse(tgInit.body)).toMatchObject({ chat_id: '42', parse_mode: 'HTML' })

    const [waUrl, waInit] = fetchMock.mock.calls.find(([url]) => String(url).includes('graph.facebook'))!
    expect(waUrl).toBe('https://graph.facebook.com/v26.0/1000/messages')
    expect(waInit.headers.Authorization).toBe('Bearer EAAG-secret')
    expect(JSON.parse(waInit.body)).toMatchObject({
      to: '34600111222',
      type: 'template',
      template: { name: 'store_alert', language: { code: 'en' } },
    })
  })

  it('skips channels that are not configured', async () => {
    expect(await notifyOwner(order, {} as NodeJS.ProcessEnv)).toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still delivers to one messenger when the other fails, and never logs a token', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('graph.facebook')
        ? new Response(JSON.stringify({ error: { message: 'Template name does not exist', code: 132001 } }), { status: 404 })
        : new Response('{}', { status: 200 }),
    )
    expect(await notifyOwner(support, env)).toEqual({ telegram: true, whatsapp: false })

    const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(logged).toContain('Template name does not exist')
    expect(logged).not.toContain('secret')
  })

  it('does not throw when a messenger is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(notifyOwner(order, env)).resolves.toEqual({ telegram: false, whatsapp: false })
  })
})

describe('lowStockAfter', () => {
  const stock = [
    { id: 'sweater', title: 'Sweater', inventory_count: 9, variants: [{ id: 'm', size: 'M', inventory_count: 0 }, { id: 'l', size: 'L', inventory_count: 9 }] },
    { id: 'lamp', title: 'Lamp', inventory_count: 4, variants: [] },
    { id: 'cam', title: 'Camera', inventory_count: 30, variants: [] },
  ]
  const line = (product_id: string, variant_id: string | null = null) => ({
    product_id,
    variant_id,
    variant_label: null,
    quantity: 1,
    unit_price: 1,
  })

  it('reports sizes and products at or under the mark, once each', () => {
    expect(lowStockAfter([line('sweater', 'm'), line('sweater', 'l'), line('lamp'), line('lamp'), line('cam')], stock)).toEqual([
      { title: 'Sweater', size: 'M', left: 0 },
      { title: 'Lamp', size: null, left: 4 },
    ])
  })
})
