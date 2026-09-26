import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { clientIp, hitLimit } from '@/lib/rate-limit'
import { translatorFor } from '@/i18n/messages'
import { LOCALES } from '@/i18n/routing'
import { CHAT_LIMITS } from '@/lib/chat/request'

export const runtime = 'nodejs'

const supportRequestSchema = z.object({
  locale: z.enum(LOCALES).default('en'),
  email: z.email().max(254),
  message: z.string().trim().min(1).max(2000),
  summary: z.string().trim().max(500).optional(),
  // The chat so far, so the team does not ask again what the shopper already said.
  transcript: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(CHAT_LIMITS.messageChars * 4),
      }),
    )
    .max(CHAT_LIMITS.messages)
    .default([]),
})

/**
 * "Talk to a person": stores the request for the admin panel. Written with the
 * service role (the table has no insert policy), after validation and a rate
 * limit, because every row lands in a person's inbox.
 */
export async function POST(req: Request) {
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    // Answered as invalid below, after the limiter.
  }
  const { t } = translatorFor((body as { locale?: unknown } | null)?.locale)

  const service = createServiceClient()
  if (!service) return NextResponse.json({ error: t('Chat.api.unavailable') }, { status: 503 })

  const limited = await hitLimit(service, 'support', clientIp(req.headers))
  if (!limited.allowed) {
    return NextResponse.json(
      { error: t('Chat.api.tooMany') },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  const parsed = supportRequestSchema.safeParse(body)
  if (!parsed.success) {
    const badEmail = parsed.error.issues.some((i) => i.path[0] === 'email')
    return NextResponse.json({ error: t(badEmail ? 'Chat.handoff.badEmail' : 'Chat.api.invalid') }, { status: 400 })
  }
  const { locale, email, message, summary, transcript } = parsed.data

  const {
    data: { user },
  } = await (await createClient()).auth.getUser()

  const { error } = await service.from('support_requests').insert({
    user_id: user?.id ?? null,
    email,
    message,
    summary: summary || null,
    transcript,
    locale,
  })
  if (error) {
    console.error('Support request not saved:', error)
    return NextResponse.json({ error: t('Chat.api.unavailable') }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
