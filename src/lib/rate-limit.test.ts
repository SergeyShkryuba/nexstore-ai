import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { clientIp, hitLimit, limitKey, LIMITS } from './rate-limit'

describe('clientIp', () => {
  it('prefers the platform-set x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })
    expect(clientIp(headers)).toBe('203.0.113.7')
  })

  it('falls back to the first x-forwarded-for hop', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': ' 198.51.100.1 , 10.0.0.1' }))).toBe('198.51.100.1')
  })

  it('puts callers with no address header in one shared bucket', () => {
    expect(clientIp(new Headers())).toBe('unknown')
  })
})

describe('limitKey', () => {
  it('is stable for the same scope and id', () => {
    expect(limitKey('checkout', '203.0.113.7', 's3cret')).toBe(limitKey('checkout', '203.0.113.7', 's3cret'))
  })

  it('never contains the id itself', () => {
    expect(limitKey('checkout', '203.0.113.7', 's3cret')).not.toContain('203.0.113.7')
  })

  it('differs between scopes, ids and secrets', () => {
    const base = limitKey('checkout', '203.0.113.7', 's3cret')
    expect(limitKey('search', '203.0.113.7', 's3cret')).not.toBe(base)
    expect(limitKey('checkout', '203.0.113.8', 's3cret')).not.toBe(base)
    expect(limitKey('checkout', '203.0.113.7', 'other')).not.toBe(base)
  })

  it('refuses to produce a key without a secret, rather than storing raw ids', () => {
    expect(limitKey('checkout', '203.0.113.7', '')).toBeNull()
    expect(limitKey('checkout', '203.0.113.7', undefined)).toBeNull()
  })
})

describe('hitLimit', () => {
  const rpc = vi.fn()
  const service = { rpc } as unknown as Parameters<typeof hitLimit>[0]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('counts the hit against the scope limit, keyed by an HMAC', async () => {
    rpc.mockResolvedValue({ data: true, error: null })

    expect(await hitLimit(service, 'checkout', '203.0.113.7')).toEqual({ allowed: true })
    expect(rpc).toHaveBeenCalledWith('rate_limit_hit', {
      p_key: limitKey('checkout', '203.0.113.7', 'service-key'),
      p_limit: LIMITS.checkout.limit,
      p_window_seconds: LIMITS.checkout.windowSeconds,
    })
  })

  it('refuses over the limit, with a wait no longer than one window', async () => {
    rpc.mockResolvedValue({ data: false, error: null })

    const result = await hitLimit(service, 'search', '203.0.113.7')
    expect(result.allowed).toBe(false)
    if (result.allowed) return
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(LIMITS.search.windowSeconds)
  })

  it('fails open when the counter is unavailable', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    expect(await hitLimit(service, 'checkout', '203.0.113.7')).toEqual({ allowed: true })
  })

  it('does nothing without a service client or a secret', async () => {
    expect(await hitLimit(null, 'checkout', '203.0.113.7')).toEqual({ allowed: true })
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect(await hitLimit(service, 'checkout', '203.0.113.7')).toEqual({ allowed: true })
    expect(rpc).not.toHaveBeenCalled()
  })
})
