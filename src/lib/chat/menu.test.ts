import { describe, it, expect, vi, beforeEach } from 'vitest'

const searchCatalogue = vi.fn()
vi.mock('@/lib/search-service', () => ({ searchCatalogue: (...a: unknown[]) => searchCatalogue(...a) }))
const runTool = vi.fn()
vi.mock('./tools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tools')>()),
  runTool: (...a: unknown[]) => runTool(...a),
}))

import { runMenu } from './menu'
import type { ChatEvent } from './events'
import type { ToolContext } from './tools'

const ctx = { catalogue: {}, account: {}, userId: null, locale: 'ru' } as unknown as ToolContext

async function run(args: Omit<Parameters<typeof runMenu>[0], 'ctx' | 'emit'>) {
  const events: ChatEvent[] = []
  await runMenu({ ...args, ctx, emit: (e) => events.push(e) })
  return events
}

const hit = (slug: string, price: number) => ({
  product: { id: slug, slug, title: slug, price, image_urls: [], inventory_count: 2 },
  score: 1,
  matchedTerms: [],
})

beforeEach(() => {
  searchCatalogue.mockReset()
  runTool.mockReset()
})

describe('button mode', () => {
  it('searches typed text in the shopper’s language and names the budget', async () => {
    searchCatalogue.mockResolvedValue({ maxPrice: 100, results: [hit('earbuds', 79)] })
    const events = await run({ text: 'наушники до 100' })
    expect(searchCatalogue).toHaveBeenCalledWith(ctx.catalogue, 'наушники до 100', 'ru')
    expect(events[0]).toMatchObject({ type: 'text' })
    expect((events[0] as { text: string }).text).toMatch(/^Вот что нашлось до 100,00\s€:$/)
    expect(events[1]).toMatchObject({ type: 'products', products: [{ slug: 'earbuds', price: 79 }] })
  })

  it('says so when nothing matches', async () => {
    searchCatalogue.mockResolvedValue({ maxPrice: null, results: [] })
    expect(await run({ text: 'кухонный нож' })).toEqual([{ type: 'text', text: expect.stringContaining('Ничего не нашлось') }])
  })

  it('shows the shopper’s orders, or the sign-in prompt, from the same tool as the AI', async () => {
    runTool.mockResolvedValue({ content: '{}', event: { type: 'orders', signedIn: false, orders: [] } })
    expect(await run({ action: 'orders', text: '📦 Мои заказы' })).toEqual([
      { type: 'orders', signedIn: false, orders: [] },
    ])
    expect(runTool).toHaveBeenCalledWith('get_my_orders', {}, ctx)
  })

  it('answers delivery questions from the policy page, and opens the contact form', async () => {
    const [shipping] = await run({ action: 'shipping', text: '' })
    expect((shipping as { text: string }).text).toContain('30')
    expect(await run({ action: 'human', text: '' })).toEqual([
      { type: 'text', text: expect.stringContaining('email') },
      { type: 'handoff', summary: '' },
    ])
  })
})
