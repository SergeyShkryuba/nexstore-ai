import { describe, it, expect } from 'vitest'
import en from '../../messages/en.json'
import ru from '../../messages/ru.json'
import { storeMessages } from './store-messages'

const flat = (value: unknown): string => JSON.stringify(value)

describe('storeMessages', () => {
  it('leaves the demo store as written', () => {
    expect(storeMessages(en, { name: 'NexStore', demo: true })).toBe(en)
  })

  it('puts the store’s own name everywhere the texts say NexStore, in every language', () => {
    const renamed = storeMessages(ru, { name: 'Casa Luz', demo: true })
    expect(flat(renamed)).not.toContain('NexStore')
    expect(renamed.Metadata.title).toContain('Casa Luz')
    expect(renamed.Bot.greeting).toContain('Casa Luz')
  })

  it('drops the demo notices from the legal pages outside demo mode, and leaves the source files alone', () => {
    const live = storeMessages(en, { name: 'NexStore', demo: false })
    for (const page of ['privacy', 'terms', 'shipping'] as const) {
      expect(live.Pages[page].sections.some((s) => 'demo' in s && s.demo)).toBe(false)
      expect(en.Pages[page].sections.some((s) => 'demo' in s && s.demo)).toBe(true)
    }
    expect('intro' in live.Pages.shipping).toBe(false)
    // Unrendered, but every message reaches the browser: no demo wording in the page source either.
    expect(flat(live)).not.toMatch(/portfolio|Stripe test mode/i)
    expect(live.Pages.privacy.sections.length).toBe(en.Pages.privacy.sections.length - 1)
  })
})
