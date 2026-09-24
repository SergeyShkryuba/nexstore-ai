import { describe, it, expect, vi, beforeEach } from 'vitest'

const select = vi.fn()
vi.mock('@/utils/supabase/public', () => ({
  createPublicClient: () => ({ from: () => ({ select }) }),
}))

import { GET } from './route'

const product = (id: string, title: string, image_urls: string[] = []) => ({
  id,
  title,
  slug: id,
  description: null,
  price: 10,
  category_id: null,
  image_urls,
  attributes: null,
})

const suggest = async (q: string) => {
  const res = await GET(new Request(`http://test/api/search/suggest?q=${encodeURIComponent(q)}`))
  return { status: res.status, body: await res.json() }
}

describe('GET /api/search/suggest', () => {
  beforeEach(() => select.mockReset())

  it('answers short queries without touching the database', async () => {
    expect(await suggest('h')).toEqual({ status: 200, body: { suggestions: [] } })
    expect(select).not.toHaveBeenCalled()
  })

  it('prefix-matches and returns lean suggestions', async () => {
    select.mockResolvedValue({
      data: [
        product('headphones', 'Wireless Headphones', ['https://img/1.jpg', 'https://img/2.jpg']),
        product('bulb', 'Smart Bulb'),
      ],
      error: null,
    })

    const { status, body } = await suggest('head')

    expect(status).toBe(200)
    expect(body.suggestions).toEqual([
      {
        id: 'headphones',
        title: 'Wireless Headphones',
        slug: 'headphones',
        price: 10,
        image_url: 'https://img/1.jpg',
      },
    ])
  })

  it('returns at most five suggestions', async () => {
    select.mockResolvedValue({
      data: Array.from({ length: 8 }, (_, i) => product(`bulb-${i}`, `Smart Bulb ${i}`)),
      error: null,
    })
    expect((await suggest('smart')).body.suggestions).toHaveLength(5)
  })

  it('degrades to no suggestions when the database fails', async () => {
    select.mockResolvedValue({ data: null, error: { message: 'down' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await suggest('head')).toEqual({ status: 503, body: { suggestions: [] } })
  })
})
