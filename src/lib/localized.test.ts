import { describe, it, expect } from 'vitest'
import { localizeCategory, localizeProduct, localizeProducts } from './localized'

const headphones = {
  id: 'p1',
  title: 'Wireless Headphones',
  description: 'Noise-canceling.',
  attributes: { color: 'Black' },
  translations: [
    { locale: 'es', title: 'Auriculares', description: 'Con cancelación de ruido.', attributes: { color: 'Negro' } },
    { locale: 'ru', title: 'Наушники', description: null, attributes: null },
  ],
}

describe('localizeProduct', () => {
  it('uses the translation for the locale', () => {
    expect(localizeProduct(headphones, 'es')).toEqual({
      id: 'p1',
      title: 'Auriculares',
      description: 'Con cancelación de ruido.',
      attributes: { color: 'Negro' },
    })
  })

  it('falls back to English for fields a translation leaves out', () => {
    expect(localizeProduct(headphones, 'ru')).toEqual({
      id: 'p1',
      title: 'Наушники',
      description: 'Noise-canceling.',
      attributes: { color: 'Black' },
    })
  })

  it('is the row itself in English, without the embedded translations', () => {
    expect(localizeProduct(headphones, 'en')).toEqual({
      id: 'p1',
      title: 'Wireless Headphones',
      description: 'Noise-canceling.',
      attributes: { color: 'Black' },
    })
  })

  it('does not add fields the query did not select', () => {
    const card = { id: 'p1', title: 'Wireless Headphones', translations: headphones.translations }
    expect(localizeProduct(card, 'es')).toEqual({ id: 'p1', title: 'Auriculares' })
  })

  it('handles rows with no translations at all', () => {
    expect(localizeProducts([{ id: 'p2', title: 'Keyboard', translations: null }], 'es')).toEqual([
      { id: 'p2', title: 'Keyboard' },
    ])
    expect(localizeProducts(null, 'ru')).toEqual([])
  })
})

describe('localizeCategory', () => {
  it('translates the name and description, falling back to English', () => {
    const category = {
      slug: 'clothing',
      name: 'Clothing',
      description: 'Apparel',
      translations: [{ locale: 'es', name: 'Ropa', description: null }],
    }
    expect(localizeCategory(category, 'es')).toEqual({ slug: 'clothing', name: 'Ropa', description: 'Apparel' })
    expect(localizeCategory(category, 'ru')).toEqual({ slug: 'clothing', name: 'Clothing', description: 'Apparel' })
  })
})
