'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { decodeEvents, type ChatEvent, type ChatOrder, type ChatProduct } from '@/lib/chat/events'
import { CHAT_LIMITS, type ChatMessage } from '@/lib/chat/request'
import type { Locale } from '@/i18n/routing'

export type UiMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  products?: ChatProduct[]
  orders?: { signedIn: boolean; orders: ChatOrder[] }
  handoff?: { summary: string }
  /** A message key under `Chat` (busy, unavailable, network) or a server-sent sentence. */
  error?: { key: 'busy' | 'unavailable' | 'network' } | { text: string }
}

/** The conversation survives page navigation and reloads, not closing the tab. */
const STORAGE_KEY = 'nexstore-chat'

function load(): UiMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    const parsed: unknown = saved ? JSON.parse(saved) : []
    return Array.isArray(parsed) ? (parsed as UiMessage[]) : []
  } catch {
    return []
  }
}

function save(messages: readonly UiMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  } catch {
    // Private mode or full storage: the chat still works, it just is not kept.
  }
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()))

/**
 * What the server gets: the text of each message, plus a note of which
 * products an assistant message showed as cards, so "tell me more about the
 * second one" still makes sense to the model a turn later.
 */
export function toHistory(messages: readonly UiMessage[]): ChatMessage[] {
  const maxChars = CHAT_LIMITS.messageChars * 4
  return messages
    .map((m): ChatMessage | null => {
      let content = m.text.trim()
      if (m.role === 'assistant' && m.products?.length) {
        const shown = m.products.map((p) => `${p.title} (${p.slug})`).join('; ')
        content = `${content}\n\n[Product cards shown: ${shown}]`.trim()
      }
      return content ? { role: m.role, content: content.slice(0, maxChars) } : null
    })
    .filter((m): m is ChatMessage => m !== null)
    .slice(-CHAT_LIMITS.messages)
}

/** Applies one streamed event to the assistant message being written. */
export function applyEvent(message: UiMessage, event: ChatEvent): UiMessage {
  switch (event.type) {
    case 'text':
      return { ...message, text: message.text + event.text }
    case 'products': {
      // A search and a lookup of the same product show it once.
      const seen = new Set((message.products ?? []).map((p) => p.id))
      return { ...message, products: [...(message.products ?? []), ...event.products.filter((p) => !seen.has(p.id))] }
    }
    case 'orders':
      return { ...message, orders: { signedIn: event.signedIn, orders: event.orders } }
    case 'handoff':
      return { ...message, handoff: { summary: event.summary } }
    case 'error':
      return { ...message, error: { key: event.code } }
    case 'done':
      return message
  }
}

export function useChat(locale: Locale) {
  // Empty on the server. The saved chat only shows inside the panel, which is
  // closed on the first render, so reading it here cannot cause a mismatch.
  const [messages, setMessages] = useState<UiMessage[]>(load)
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    if (!streaming) save(messages)
  }, [messages, streaming])

  const update = useCallback((id: string, change: (m: UiMessage) => UiMessage) => {
    setMessages((all) => all.map((m) => (m.id === id ? change(m) : m)))
  }, [])

  const send = useCallback(
    async (text: string) => {
      const content = text.trim().slice(0, CHAT_LIMITS.messageChars)
      if (!content || streaming) return

      const user: UiMessage = { id: newId(), role: 'user', text: content }
      const reply: UiMessage = { id: newId(), role: 'assistant', text: '' }
      const history = toHistory([...messages, user])
      setMessages((all) => [...all, user, reply])
      setStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller
      let finished = false

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale, messages: history }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null
          update(reply.id, (m) => ({ ...m, error: data?.error ? { text: data.error } : { key: 'unavailable' } }))
          finished = true
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          const { events, rest } = decodeEvents(buffer + decoder.decode(value, { stream: true }))
          buffer = rest
          for (const event of events) {
            if (event.type === 'done' || event.type === 'error') finished = true
            update(reply.id, (m) => applyEvent(m, event))
          }
        }
      } catch {
        if (controller.signal.aborted) finished = true
      } finally {
        // Cut off mid-reply without a word from the server: say so.
        if (!finished) update(reply.id, (m) => ({ ...m, error: { key: 'network' } }))
        if (abortRef.current === controller) abortRef.current = null
        setStreaming(false)
      }
    },
    [locale, messages, streaming, update],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    save([])
  }, [])

  return { messages, streaming, send, reset }
}
