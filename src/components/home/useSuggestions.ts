'use client'

import { useEffect, useState } from 'react'
import type { Suggestion } from '@/app/api/search/suggest/route'

const DEBOUNCE_MS = 150

/**
 * Type-ahead suggestions for `query`, fetched after a short pause in typing.
 * Each new keystroke aborts the previous request, so a slow answer for "hea"
 * can never overwrite the answer for "head".
 */
export function useSuggestions(query: string, enabled: boolean): Suggestion[] {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const q = query.trim()
  const active = enabled && q.length >= 2

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = (await res.json()) as { suggestions: Suggestion[] }
        setSuggestions(data.suggestions)
      } catch {
        // Aborted by the next keystroke, or offline: no suggestions is fine.
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, active])

  // The last answer stays visible while the next one loads, which avoids the
  // list flickering shut on every keystroke.
  return active ? suggestions : []
}
