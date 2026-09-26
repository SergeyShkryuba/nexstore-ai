import { describe, it, expect } from 'vitest'
import { createTranslator } from 'next-intl'
import { MESSAGES } from './messages'
import { LOCALES } from './routing'

type Tree = { [key: string]: unknown }

/** Every leaf as [path, value]; array items are numbered so structure is compared too. */
function leaves(tree: unknown, prefix = ''): [string, string][] {
  if (typeof tree === 'string') return [[prefix, tree]]
  if (Array.isArray(tree)) return tree.flatMap((item, i) => leaves(item, `${prefix}[${i}]`))
  if (tree && typeof tree === 'object') {
    return Object.entries(tree as Tree).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k))
  }
  return [[prefix, String(tree)]]
}

/** `{name}` and `{name, plural, …}` arguments, and <tag>s, sorted. */
function shape(message: string) {
  const args = [...message.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1])
  const tags = [...message.matchAll(/<(\w+)>/g)].map((m) => m[1])
  return { args: [...new Set(args)].sort(), tags: [...new Set(tags)].sort() }
}

const english = new Map(leaves(MESSAGES.en))

describe.each(LOCALES.filter((l) => l !== 'en'))('%s messages', (locale) => {
  const translated = new Map(leaves(MESSAGES[locale]))

  it('has exactly the English keys (and the same list lengths)', () => {
    expect([...translated.keys()].sort()).toEqual([...english.keys()].sort())
  })

  it('uses the same placeholders and tags as English in every message', () => {
    const mismatches = [...english].flatMap(([key, en]) => {
      const other = translated.get(key)
      if (other === undefined) return []
      // Demo-page prose is rendered by RichText, not ICU; its tags must still match.
      return JSON.stringify(shape(en)) === JSON.stringify(shape(other)) ? [] : [`${key}: ${other}`]
    })
    expect(mismatches).toEqual([])
  })

  it('translates rather than copies English', () => {
    const copied = [...english].filter(([key, en]) => en.length > 12 && translated.get(key) === en)
    // Brand names and the tech stack line are legitimately identical.
    expect(copied.map(([key]) => key).filter((k) => !k.includes('about.sections[1]'))).toEqual([])
  })
})

describe('plural messages', () => {
  it.each([
    ['ru', 1, 'Осталась 1 штука'],
    ['ru', 3, 'Осталось 3 штуки'],
    ['ru', 5, 'Осталось 5 штук'],
    ['es', 2, 'Solo quedan 2'],
    ['en', 4, 'Only 4 left'],
  ] as const)('formats %s stock for %i', (locale, count, expected) => {
    const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'Stock' })
    expect(t('low', { count })).toBe(expected)
  })

  it('declines Russian review counts', () => {
    const t = createTranslator({ locale: 'ru', messages: MESSAGES.ru, namespace: 'Product' })
    expect([1, 2, 5, 21].map((count) => t('reviewCount', { count }))).toEqual([
      '1 отзыв',
      '2 отзыва',
      '5 отзывов',
      '21 отзыв',
    ])
  })
})
