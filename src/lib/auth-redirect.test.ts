import { describe, it, expect } from 'vitest'
import { authCallbackUrl, safeNextPath } from './auth-redirect'

describe('safeNextPath', () => {
  it.each([
    ['/profile', '/profile'],
    ['/account/update-password', '/account/update-password'],
    ['/categories/all?sort=price-asc#top', '/categories/all?sort=price-asc#top'],
  ])('keeps the same-site path %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected)
  })

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    'evil.com',
    'javascript:alert(1)',
    '',
    null,
    undefined,
  ])('refuses %s', (raw) => {
    expect(safeNextPath(raw)).toBe('/')
  })

  it('uses the given fallback', () => {
    expect(safeNextPath('//evil.com', '/profile')).toBe('/profile')
  })
})

describe('authCallbackUrl', () => {
  it('encodes the destination', () => {
    expect(authCallbackUrl('https://shop.example', '/account/update-password')).toBe(
      'https://shop.example/auth/callback?next=%2Faccount%2Fupdate-password',
    )
  })
})
