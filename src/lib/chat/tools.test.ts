import { describe, it, expect, vi, beforeEach } from 'vitest'

const searchCatalogue = vi.fn()
vi.mock('@/lib/search-service', () => ({ searchCatalogue: (...args: unknown[]) => searchCatalogue(...args) }))

import { runTool, type ToolContext } from './tools'

const product = (slug: string, price: number, extra: Record<string, unknown> = {}) => ({
  id: `id-${slug}`,
  slug,
  title: slug.replace(/-/g, ' '),
  description: 'A product. '.repeat(40),
  price,
  category_id: null,
  image_urls: [`https://img/${slug}.jpg`],
  attributes: null,
  inventory_count: 3,
  variants: [],
  ...extra,
})

/** from(table).select().eq().order().limit() / .maybeSingle(), recording the filters. */
function fakeClient(result: { data: unknown; error: unknown }) {
  const eq = vi.fn()
  const chain = {
    select: () => chain,
    eq: (...args: unknown[]) => {
      eq(...args)
      return chain
    },
    order: () => chain,
    limit: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  }
  const from = vi.fn(() => chain)
  // Enough of a Supabase client for these tools; the cast stands in for the rest.
  const client = { from, rpc: vi.fn() } as unknown as ToolContext['catalogue']
  return { client, eq, from }
}

const context = (overrides: Partial<ToolContext> = {}): ToolContext => ({
  catalogue: fakeClient({ data: null, error: null }).client,
  account: fakeClient({ data: [], error: null }).client,
  userId: null,
  locale: 'ru',
  ...overrides,
})

beforeEach(() => searchCatalogue.mockReset())

describe('search_products', () => {
  it('searches in English, shows results in the shopper’s language, and applies the budget', async () => {
    searchCatalogue.mockResolvedValue({
      maxPrice: null,
      strategy: 'hybrid',
      results: [product('pro-headphones', 250), product('earbuds', 60), product('sport-earbuds', 80)].map((p) => ({
        product: p,
        score: 1,
        matchedTerms: [],
        similarity: 0.9,
      })),
    })
    const ctx = context()
    const outcome = await runTool('search_products', { query: 'headphones', max_price: 100 }, ctx)

    expect(searchCatalogue).toHaveBeenCalledWith(ctx.catalogue, 'headphones', 'en', 'ru')
    const answer = JSON.parse(outcome.content)
    expect(answer.results.map((r: { slug: string }) => r.slug)).toEqual(['earbuds', 'sport-earbuds'])
    expect(answer.results[0].description.length).toBeLessThanOrEqual(160)
    expect(outcome.event).toEqual({
      type: 'products',
      products: [
        { id: 'id-earbuds', slug: 'earbuds', title: 'earbuds', price: 60, image_url: 'https://img/earbuds.jpg', inventory_count: 3 },
        {
          id: 'id-sport-earbuds',
          slug: 'sport-earbuds',
          title: 'sport earbuds',
          price: 80,
          image_url: 'https://img/sport-earbuds.jpg',
          inventory_count: 3,
        },
      ],
    })
  })

  it('reports only the sizes that are in stock', async () => {
    const sweater = product('sweater', 40, {
      variants: [
        { size: 'L', inventory_count: 0, sort_order: 2 },
        { size: 'S', inventory_count: 2, sort_order: 0 },
        { size: 'M', inventory_count: 1, sort_order: 1 },
      ],
    })
    searchCatalogue.mockResolvedValue({ results: [{ product: sweater }] })
    const answer = JSON.parse((await runTool('search_products', { query: 'sweater' }, context())).content)
    expect(answer.results[0].sizes_in_stock).toEqual(['S', 'M'])
  })

  it('shows no cards when nothing matched, and rejects a query that is too short', async () => {
    searchCatalogue.mockResolvedValue({ results: [] })
    expect((await runTool('search_products', { query: 'unicorn' }, context())).event).toBeUndefined()

    const bad = await runTool('search_products', { query: 'x' }, context())
    expect(bad.isError).toBe(true)
    expect(searchCatalogue).toHaveBeenCalledTimes(1)
  })
})

describe('get_product', () => {
  it('says so when the slug is unknown', async () => {
    const outcome = await runTool('get_product', { slug: 'nope' }, context())
    expect(outcome.isError).toBe(true)
    expect(outcome.event).toBeUndefined()
  })

  it('returns the translated product with stock per size', async () => {
    const { client } = fakeClient({
      data: product('sweater', 40, {
        variants: [
          { size: 'M', inventory_count: 0, sort_order: 1 },
          { size: 'S', inventory_count: 2, sort_order: 0 },
        ],
        translations: [{ locale: 'ru', title: 'Свитер', description: 'Тёплый', attributes: null }],
      }),
      error: null,
    })
    const outcome = await runTool('get_product', { slug: 'sweater' }, context({ catalogue: client }))
    const answer = JSON.parse(outcome.content)
    expect(answer.title).toBe('Свитер')
    expect(answer.sizes).toEqual([
      { size: 'S', in_stock: true },
      { size: 'M', in_stock: false },
    ])
    expect(outcome.event).toMatchObject({ type: 'products', products: [{ title: 'Свитер' }] })
  })
})

describe('get_my_orders', () => {
  const order = (id: string, status: string) => ({
    id,
    created_at: '2026-09-20T10:00:00Z',
    status,
    total_amount: '59.90',
    order_items: [{ quantity: 2, variant_label: 'M', product: { title: 'Sweater', translations: [] } }],
  })

  it('asks visitors to sign in without touching the database', async () => {
    const account = fakeClient({ data: [], error: null })
    const outcome = await runTool('get_my_orders', {}, context({ account: account.client }))
    expect(JSON.parse(outcome.content)).toEqual({ signed_in: false })
    expect(outcome.event).toEqual({ type: 'orders', signedIn: false, orders: [] })
    expect(account.from).not.toHaveBeenCalled()
  })

  it("reads only the shopper's own orders, even for an admin whom RLS would show all", async () => {
    const account = fakeClient({ data: [order('3f9a1c2b-0000', 'shipped')], error: null })
    const outcome = await runTool('get_my_orders', {}, context({ account: account.client, userId: 'user-1' }))

    expect(account.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(JSON.parse(outcome.content).orders[0]).toMatchObject({ number: '3f9a1c2b', status: 'shipped', total_eur: 59.9 })
    expect(outcome.event).toEqual({
      type: 'orders',
      signedIn: true,
      orders: [{ id: '3f9a1c2b-0000', created_at: '2026-09-20T10:00:00Z', status: 'shipped', total_amount: 59.9, item_count: 2 }],
    })
  })

  it('finds one order by the number on its page', async () => {
    const account = fakeClient({ data: [order('aaaa1111-0000', 'paid'), order('bbbb2222-0000', 'delivered')], error: null })
    const outcome = await runTool('get_my_orders', { order_ref: '#BBBB2222' }, context({ account: account.client, userId: 'u' }))
    expect(JSON.parse(outcome.content).orders.map((o: { number: string }) => o.number)).toEqual(['bbbb2222'])
  })
})

describe('request_human and unknown tools', () => {
  it('opens the contact form with the summary', async () => {
    const outcome = await runTool('request_human', { summary: 'Order bbbb2222 arrived damaged' }, context())
    expect(outcome.event).toEqual({ type: 'handoff', summary: 'Order bbbb2222 arrived damaged' })
  })

  it('answers an unknown tool with an error rather than throwing', async () => {
    expect((await runTool('delete_everything', {}, context())).isError).toBe(true)
  })
})
