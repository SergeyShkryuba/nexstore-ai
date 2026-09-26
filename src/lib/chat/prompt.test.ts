import { describe, it, expect } from 'vitest'
import { storePolicies, systemPrompt } from './prompt'

describe('shop assistant prompt', () => {
  it('carries the policies the shipping page promises, without page markup', () => {
    const policies = storePolicies()
    expect(policies).toContain('30 days')
    expect(policies).toContain('1-year warranty')
    expect(policies).not.toMatch(/<\/?(?:b|link)>/)
  })

  it('keeps the cacheable part identical across languages and states the page language after it', () => {
    const en = systemPrompt('en')
    const ru = systemPrompt('ru')
    expect(en[0]).toEqual(ru[0])
    expect(en[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(ru[1].text).toContain('Русский')
  })
})
