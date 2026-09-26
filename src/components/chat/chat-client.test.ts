import { describe, it, expect } from 'vitest'
import { applyEvent, toHistory, type UiMessage } from './useChat'
import { toBlocks } from './MessageText'

const reply = (overrides: Partial<UiMessage> = {}): UiMessage => ({ id: 'a', role: 'assistant', text: '', ...overrides })

describe('applyEvent', () => {
  it('appends text and shows each product once', () => {
    const card = { id: 'p1', slug: 'earbuds', title: 'Earbuds', price: 60, image_url: null, inventory_count: 2 }
    let message = applyEvent(reply(), { type: 'text', text: 'Found ' })
    message = applyEvent(message, { type: 'text', text: 'these:' })
    message = applyEvent(message, { type: 'products', products: [card] })
    message = applyEvent(message, { type: 'products', products: [card] })
    expect(message.text).toBe('Found these:')
    expect(message.products).toEqual([card])
  })

  it('records an error by kind', () => {
    expect(applyEvent(reply(), { type: 'error', code: 'busy' }).error).toEqual({ key: 'busy' })
  })
})

describe('toHistory', () => {
  it('sends text, notes which product cards were shown, and drops empty replies', () => {
    const history = toHistory([
      { id: '1', role: 'user', text: 'earbuds?' },
      reply({
        text: 'Two options.',
        products: [{ id: 'p1', slug: 'earbuds', title: 'Earbuds', price: 60, image_url: null, inventory_count: 1 }],
      }),
      { id: '3', role: 'assistant', text: '', error: { key: 'network' } },
      { id: '4', role: 'user', text: 'the first one' },
    ])
    expect(history).toEqual([
      { role: 'user', content: 'earbuds?' },
      { role: 'assistant', content: 'Two options.\n\n[Product cards shown: Earbuds (earbuds)]' },
      { role: 'user', content: 'the first one' },
    ])
  })
})

describe('toBlocks', () => {
  it('splits paragraphs and turns "- " lines into a list', () => {
    expect(toBlocks('Here you go:\n- **Earbuds**, €60\n- Headphones, €90\n\nAnything else?')).toEqual([
      { kind: 'p', lines: ['Here you go:'] },
      { kind: 'ul', items: ['**Earbuds**, €60', 'Headphones, €90'] },
      { kind: 'p', lines: ['Anything else?'] },
    ])
  })

  it('does not read a bold opening as a list item', () => {
    expect(toBlocks('**Free** shipping')).toEqual([{ kind: 'p', lines: ['**Free** shipping'] }])
  })
})
