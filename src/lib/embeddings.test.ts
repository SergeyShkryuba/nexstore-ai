import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  EMBEDDING_DIMENSIONS,
  contentHash,
  embedTexts,
  isEmbeddableQuery,
  productEmbeddingText,
  toPgVector,
} from './embeddings'

describe('productEmbeddingText', () => {
  it('combines title, category, description and attributes', () => {
    expect(
      productEmbeddingText({
        title: 'Merino Wool Sweater',
        category: 'Clothing',
        description: 'Soft and  warm.',
        attributes: { color: 'Grey', material: 'Merino' },
      }),
    ).toBe('Merino Wool Sweater. Clothing: Merino Wool Sweater. Soft and warm.. color: Grey, material: Merino')
  })

  it('skips missing parts', () => {
    expect(productEmbeddingText({ title: 'Bulb', description: null })).toBe('Bulb')
  })
})

describe('contentHash', () => {
  it('is a stable SHA-256 hex digest', async () => {
    const hash = await contentHash('Bulb')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await contentHash('Bulb')).toBe(hash)
    expect(await contentHash('Bulb.')).not.toBe(hash)
  })
})

describe('toPgVector', () => {
  it('uses the pgvector text format', () => {
    expect(toPgVector([0.1, -0.2, 3])).toBe('[0.1,-0.2,3]')
  })
})

describe('embedTexts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.01)
  const config = { supabaseUrl: 'https://ref.supabase.co/', apiKey: 'anon-key' }

  it('defaults to the service-role key — the function refuses the public anon key', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://ref.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-anon-key')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ embeddings: [vector] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await embedTexts(['warm sweater'])

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer service-key')
  })

  it('calls the embed Edge Function with the key and returns the vectors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ embeddings: [vector] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(embedTexts(['warm sweater'], config)).resolves.toEqual([vector])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://ref.supabase.co/functions/v1/embed')
    expect(init.headers.Authorization).toBe('Bearer anon-key')
    expect(JSON.parse(init.body)).toEqual({ input: ['warm sweater'] })
  })

  it('throws on an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })))
    await expect(embedTexts(['x'], config)).rejects.toThrow('500')
  })

  it('throws when the vectors have the wrong shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ embeddings: [[1, 2, 3]] }), { status: 200 })),
    )
    await expect(embedTexts(['x'], config)).rejects.toThrow('unexpected payload')
  })

  it('refuses to run without configuration', async () => {
    await expect(embedTexts(['x'], { supabaseUrl: '', apiKey: '' })).rejects.toThrow('not configured')
  })
})

describe('isEmbeddableQuery', () => {
  it('embeds English and other Latin-script queries', () => {
    expect(isEmbeddableQuery('film my surfing trip')).toBe(true)
    expect(isEmbeddableQuery('hogar inteligente')).toBe(true)
  })

  it('leaves Cyrillic to keyword ranking: the English model reads it as noise', () => {
    expect(isEmbeddableQuery('наушники')).toBe(false)
    expect(isEmbeddableQuery('умная колонка Wi-Fi')).toBe(false)
  })
})
