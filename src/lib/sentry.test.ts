import { describe, it, expect } from 'vitest'
import { redactSecrets, scrubBreadcrumb, scrubEvent, stripQuery } from './sentry'

describe('redactSecrets', () => {
  it('removes Stripe keys that error messages quote', () => {
    expect(redactSecrets('Invalid API Key provided: sk_test_51Habc123')).toBe(
      'Invalid API Key provided: [redacted]',
    )
    expect(redactSecrets('rk_live_9xYz and whsec_AbC123')).toBe('[redacted] and [redacted]')
  })

  it('removes JWTs and Checkout session ids', () => {
    expect(redactSecrets('key eyJhbGciOi.eyJyb2xlIjoi.c2lnbmF0dXJl here')).toBe('key [redacted] here')
    expect(redactSecrets('/checkout/success/cs_test_a1B2c3')).toBe('/checkout/success/[redacted]')
  })

  it('removes email addresses that database errors quote', () => {
    expect(redactSecrets('Key (customer_email)=(jane.doe+shop@example.co.uk) already exists')).toBe(
      'Key (customer_email)=([redacted]) already exists',
    )
  })

  it('leaves ordinary text alone', () => {
    expect(redactSecrets('Could not verify your cart')).toBe('Could not verify your cart')
  })
})

describe('stripQuery', () => {
  it('drops the query string and fragment', () => {
    expect(stripQuery('https://shop.test/checkout/success?session_id=cs_test_1#top')).toBe(
      'https://shop.test/checkout/success',
    )
  })
})

describe('scrubEvent', () => {
  it('keeps only what is needed to debug a request', () => {
    const event = scrubEvent({
      request: {
        url: 'https://shop.test/checkout/success?session_id=cs_test_1',
        query_string: 'session_id=cs_test_1',
        cookies: { 'sb-access-token': 'eyJ...' },
        data: { email: 'a@b.test' },
        headers: { Cookie: 'sb=1', Authorization: 'Bearer x', 'x-real-ip': '203.0.113.7', 'User-Agent': 'UA' },
      },
    })

    expect(event.request).toEqual({
      url: 'https://shop.test/checkout/success',
      headers: { 'User-Agent': 'UA' },
    })
  })

  it('keeps the account id but not the email or IP', () => {
    expect(scrubEvent({ user: { id: 'u1', email: 'a@b.test', ip_address: '203.0.113.7' } }).user).toEqual({
      id: 'u1',
    })
    expect(scrubEvent({ user: { ip_address: '203.0.113.7' } }).user).toEqual({})
  })

  it('redacts secrets in exceptions, messages and logged arguments', () => {
    const event = scrubEvent({
      message: 'Stripe Checkout error: sk_test_abc',
      exception: { values: [{ value: 'Invalid API Key provided: sk_live_abc' }] },
      extra: { arguments: ['Checkout failed', { message: 'bad key sk_test_zzz', nested: ['whsec_1'] }] },
    })

    expect(JSON.stringify(event)).not.toMatch(/sk_(test|live)_|whsec_/)
  })
})

describe('scrubBreadcrumb', () => {
  it('strips query strings from fetch and navigation breadcrumbs', () => {
    expect(
      scrubBreadcrumb({ data: { url: '/api/search/suggest?q=headphones', from: '/cart', to: '/checkout/success?session_id=cs_test_1' } })
        .data,
    ).toEqual({ url: '/api/search/suggest', from: '/cart', to: '/checkout/success' })
  })
})
