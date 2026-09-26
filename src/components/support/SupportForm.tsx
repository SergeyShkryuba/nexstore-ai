'use client'

import { useId, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/lib/chat/request'

type State = { status: 'idle' | 'sending' | 'sent' } | { status: 'error'; message: string }

/**
 * A message to the store team, who answer by email. Used on the contact page
 * and inside the chat, where the assistant opens it with a summary of the
 * conversation; either way the shopper sends it themselves.
 */
export function SupportForm({
  summary,
  transcript,
  compact = false,
}: {
  /** The assistant's summary, when the chat opened the form. */
  summary?: string
  /** The chat so far, sent along so the team need not ask again. */
  transcript?: () => ChatMessage[]
  /** Small type and a heading of its own, for the chat panel. */
  compact?: boolean
}) {
  const t = useTranslations('Chat.handoff')
  const locale = useLocale()
  const id = useId()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [state, setState] = useState<State>({ status: 'idle' })

  if (state.status === 'sent') {
    return (
      <p className={cn('flex items-start gap-2 rounded-xl border bg-card p-3', compact ? 'text-xs' : 'text-sm')} role="status">
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
        body: JSON.stringify({ locale, email, message, summary, transcript: transcript?.() ?? [] }),
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

  const field = compact ? 'text-base md:text-sm' : 'text-base'

  return (
    <form
      onSubmit={submit}
      className={cn('space-y-2', compact ? 'rounded-xl border bg-card p-3 text-xs' : 'space-y-4 text-sm')}
    >
      {compact && (
        <>
          <p className="font-medium">{t('title')}</p>
          <p className="text-muted-foreground">{t('intro')}</p>
        </>
      )}
      <div className="space-y-1.5">
        <label htmlFor={`${id}-email`} className={compact ? 'sr-only' : 'font-medium'}>
          {t('email')}
        </label>
        <Input
          id={`${id}-email`}
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder={compact ? t('email') : 'you@example.com'}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={cn(!compact && 'h-10')}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${id}-message`} className={compact ? 'sr-only' : 'font-medium'}>
          {t('message')}
        </label>
        <textarea
          id={`${id}-message`}
          required
          maxLength={2000}
          rows={compact ? 3 : 6}
          placeholder={compact ? t('message') : undefined}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={cn(
            'w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30',
            field,
          )}
        />
      </div>
      {state.status === 'error' && (
        <p className="text-destructive" role="alert">
          {state.message}
        </p>
      )}
      <Button
        type="submit"
        size={compact ? 'sm' : 'lg'}
        disabled={state.status === 'sending'}
        className={compact ? 'w-full' : 'px-6'}
      >
        {state.status === 'sending' ? t('sending') : t('send')}
      </Button>
    </form>
  )
}
