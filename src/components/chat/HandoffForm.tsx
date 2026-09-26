'use client'

import { useId, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ChatMessage } from '@/lib/chat/request'

type State = { status: 'idle' | 'sending' | 'sent' } | { status: 'error'; message: string }

/**
 * "Talk to a person", opened by the assistant. The shopper sends it
 * themselves: the model can offer the form but never file a request.
 */
export function HandoffForm({ summary, transcript }: { summary: string; transcript: () => ChatMessage[] }) {
  const t = useTranslations('Chat.handoff')
  const locale = useLocale()
  const id = useId()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [state, setState] = useState<State>({ status: 'idle' })

  if (state.status === 'sent') {
    return (
      <p className="flex items-start gap-2 rounded-xl border bg-card p-3 text-xs" role="status">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
        {t('sent')}
      </p>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState({ status: 'sending' })
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, email, message, summary, transcript: transcript() }),
      })
      if (res.ok) {
        setState({ status: 'sent' })
        return
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      setState({ status: 'error', message: data?.error ?? t('failed') })
    } catch {
      setState({ status: 'error', message: t('failed') })
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border bg-card p-3 text-xs">
      <p className="font-medium">{t('title')}</p>
      <p className="text-muted-foreground">{t('intro')}</p>
      <label htmlFor={`${id}-email`} className="sr-only">
        {t('email')}
      </label>
      <Input
        id={`${id}-email`}
        type="email"
        required
        maxLength={254}
        autoComplete="email"
        placeholder={t('email')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label htmlFor={`${id}-message`} className="sr-only">
        {t('message')}
      </label>
      <textarea
        id={`${id}-message`}
        required
        maxLength={2000}
        rows={3}
        placeholder={t('message')}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
      />
      {state.status === 'error' && (
        <p className="text-destructive" role="alert">
          {state.message}
        </p>
      )}
      <Button type="submit" size="sm" disabled={state.status === 'sending'} className="w-full">
        {state.status === 'sending' ? t('sending') : t('send')}
      </Button>
    </form>
  )
}
