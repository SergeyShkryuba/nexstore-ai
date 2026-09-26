'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AlertCircle, MessageCircle, RotateCcw, SendHorizontal, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePathname } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { cn } from '@/lib/utils'
import { CHAT_LIMITS } from '@/lib/chat/request'
import { MessageText } from './MessageText'
import { OrderCards, ProductCards } from './ChatCards'
import { HandoffForm } from './HandoffForm'
import { toHistory, useChat, type UiMessage } from './useChat'

/**
 * The shop assistant: a button in the corner that opens a chat panel. Replies
 * stream in as they are written; products and orders the assistant looks up
 * appear as cards with links. Not shown in the admin panel.
 */
export function ChatWidget() {
  const t = useTranslations('Chat')
  const locale = useLocale() as Locale
  const pathname = usePathname()
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const { messages, streaming, send, reset } = useChat(locale)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Follow the reply as it streams in.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (pathname.startsWith('/admin')) return null

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const submit = (text: string) => {
    if (!text.trim() || streaming) return
    setDraft('')
    void send(text)
  }

  const last = messages.at(-1)
  const waiting = streaming && last?.role === 'assistant' && !last.text && !last.products && !last.orders

  return (
    <>
      {open && (
        <section
          id={panelId}
          role="dialog"
          aria-label={t('title')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
          }}
          className="fixed inset-x-2 bottom-20 z-50 flex h-[min(36rem,calc(100dvh-6.5rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl sm:inset-x-auto sm:right-4 sm:w-96"
        >
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-tight">{t('title')}</h2>
              <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
            </div>
            {messages.length > 0 && (
              <Button variant="ghost" size="icon-sm" onClick={reset} title={t('newChat')}>
                <RotateCcw aria-hidden="true" />
                <span className="sr-only">{t('newChat')}</span>
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={close} title={t('close')}>
              <X aria-hidden="true" />
              <span className="sr-only">{t('close')}</span>
            </Button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm" aria-live="polite">
            <Bubble role="assistant">
              <p>{t('greeting')}</p>
            </Bubble>

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {(['suggestion1', 'suggestion2', 'suggestion3'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => submit(t(key))}
                    className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message) => (
              <MessageView
                key={message.id}
                message={message}
                transcript={() => toHistory(messages)}
                onNavigate={() => setOpen(false)}
              />
            ))}

            {waiting && (
              <div className="flex gap-1 px-1 py-2" role="status">
                <span className="sr-only">{t('typing')}</span>
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                    style={{ animationDelay: `${delay}ms` }}
                    aria-hidden="true"
                  />
                ))}
              </div>
            )}
          </div>

          <form
            className="border-t p-3"
            onSubmit={(e) => {
              e.preventDefault()
              submit(draft)
            }}
          >
            <div className="flex items-end gap-2">
              <label htmlFor={`${panelId}-input`} className="sr-only">
                {t('messageLabel')}
              </label>
              <textarea
                id={`${panelId}-input`}
                ref={inputRef}
                rows={1}
                value={draft}
                maxLength={CHAT_LIMITS.messageChars}
                placeholder={t('placeholder')}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    submit(draft)
                  }
                }}
                className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none field-sizing-content placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
              />
              <Button type="submit" size="icon-lg" disabled={streaming || !draft.trim()} title={t('send')}>
                <SendHorizontal aria-hidden="true" />
                <span className="sr-only">{t('send')}</span>
              </Button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{t('disclaimer')}</p>
          </form>
        </section>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="fixed bottom-4 right-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
      >
        {open ? <X className="size-6" aria-hidden="true" /> : <MessageCircle className="size-6" aria-hidden="true" />}
        <span className="sr-only">{open ? t('close') : t('open')}</span>
      </button>
    </>
  )
}

function Bubble({ role, children }: { role: UiMessage['role']; children: React.ReactNode }) {
  return (
    <div className={cn('flex', role === 'user' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed',
          role === 'user' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted',
        )}
      >
        {children}
      </div>
    </div>
  )
}

function MessageView({
  message,
  transcript,
  onNavigate,
}: {
  message: UiMessage
  transcript: () => ReturnType<typeof toHistory>
  onNavigate: () => void
}) {
  const t = useTranslations('Chat')

  if (message.role === 'user') {
    return (
      <Bubble role="user">
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
      </Bubble>
    )
  }

  return (
    <div className="space-y-2">
      {message.text && (
        <Bubble role="assistant">
          <MessageText text={message.text} />
        </Bubble>
      )}
      {message.products && message.products.length > 0 && (
        <ProductCards products={message.products} onNavigate={onNavigate} />
      )}
      {message.orders && <OrderCards {...message.orders} onNavigate={onNavigate} />}
      {message.handoff && <HandoffForm summary={message.handoff.summary} transcript={transcript} />}
      {message.error && (
        <p className="flex items-start gap-2 text-xs text-destructive" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {'key' in message.error ? t(message.error.key) : message.error.text}
        </p>
      )}
    </div>
  )
}
