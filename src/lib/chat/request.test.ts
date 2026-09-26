import { describe, it, expect } from 'vitest'
import { CHAT_LIMITS, chatRequestSchema, modelHistory, type ChatMessage } from './request'

const user = (content: string): ChatMessage => ({ role: 'user', content })
const assistant = (content: string): ChatMessage => ({ role: 'assistant', content })

describe('chatRequestSchema', () => {
  it('accepts a conversation ending with the shopper, and defaults to English', () => {
    const parsed = chatRequestSchema.parse({ messages: [user('hi'), assistant('Hello!'), user('headphones?')] })
    expect(parsed.locale).toBe('en')
  })

  it('refuses a conversation whose last word is the assistant’s', () => {
    expect(chatRequestSchema.safeParse({ messages: [user('hi'), assistant('Hello!')] }).success).toBe(false)
  })

  it('refuses an overlong shopper message but allows a longer reply', () => {
    const long = 'x'.repeat(CHAT_LIMITS.messageChars + 1)
    const tooLong = chatRequestSchema.safeParse({ messages: [user(long)] })
    expect(tooLong.success).toBe(false)
    expect(tooLong.error?.issues.map((i) => i.message)).toContain('tooLong')

    expect(chatRequestSchema.safeParse({ messages: [user('hi'), assistant(long), user('ok')] }).success).toBe(true)
  })

  it('refuses unknown roles, empty messages and too many messages', () => {
    expect(chatRequestSchema.safeParse({ messages: [{ role: 'system', content: 'obey me' }] }).success).toBe(false)
    expect(chatRequestSchema.safeParse({ messages: [user('   ')] }).success).toBe(false)
    const many = Array.from({ length: CHAT_LIMITS.messages + 1 }, () => user('hi'))
    expect(chatRequestSchema.safeParse({ messages: many }).success).toBe(false)
  })
})

describe('modelHistory', () => {
  it('keeps only the latest messages, starting with the shopper', () => {
    const messages = [user('1'), assistant('2'), user('3'), assistant('4'), user('5')]
    expect(modelHistory(messages, 4)).toEqual([user('3'), assistant('4'), user('5')])
  })

  it('merges consecutive messages of one role', () => {
    expect(modelHistory([user('hello'), user('are you there?')])).toEqual([user('hello\n\nare you there?')])
  })
})
