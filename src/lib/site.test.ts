import { describe, it, expect } from 'vitest'
import { resolveSiteUrl } from './site'

describe('resolveSiteUrl', () => {
  it('uses NEXT_PUBLIC_SITE_URL, normalised to an origin', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://shop.example.com/' })).toBe(
      'https://shop.example.com',
    )
  })

  it('treats an empty variable as unset instead of crashing', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '' })).toBe('http://localhost:3000')
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '   ' })).toBe('http://localhost:3000')
  })

  it('falls back to the Vercel production domain', () => {
    expect(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '', VERCEL_PROJECT_PRODUCTION_URL: 'nexstore.vercel.app' }),
    ).toBe('https://nexstore.vercel.app')
  })

  it('skips a value that is not a URL', () => {
    expect(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'nexstore.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'nexstore.vercel.app' }),
    ).toBe('https://nexstore.vercel.app')
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'ftp://files.example.com' })).toBe('http://localhost:3000')
  })

  it('defaults to localhost when nothing is configured', () => {
    expect(resolveSiteUrl({})).toBe('http://localhost:3000')
  })
})
