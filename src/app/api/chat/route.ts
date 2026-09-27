import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createPublicClient } from '@/utils/supabase/public'
import { createServiceClient } from '@/utils/supabase/service'
import { clientIp, hitLimit } from '@/lib/rate-limit'
import { translatorFor } from '@/i18n/messages'
import { chatRequestSchema, modelHistory } from '@/lib/chat/request'
import { encodeEvent, type ChatEvent } from '@/lib/chat/events'
import { systemPrompt } from '@/lib/chat/prompt'
import { anthropicModel, runChat, type CallModel } from '@/lib/chat/agent'
import { runMenu } from '@/lib/chat/menu'
import { loggable } from '@/lib/log'

export const runtime = 'nodejs'
// A reply with a search or two takes a few seconds; leave headroom.
export const maxDuration = 60

let client: Anthropic | undefined

/** The model, or null when the key is not configured: the assistant then works in button mode. */
function model(signal: AbortSignal): CallModel | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  // One retry: a shopper is waiting, and a second failure is better reported.
  client ??= new Anthropic({ maxRetries: 1 })
  return anthropicModel(client, signal)
}

/** Which "sorry" to show. Only the kind is sent to the browser, never the error itself. */
function errorCode(error: unknown): 'busy' | 'unavailable' {
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) return 'busy'
  if (error instanceof Anthropic.APIConnectionError) return 'busy'
  return 'unavailable'
}

export async function POST(req: Request) {
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    // Answered as invalid below, after the limiter.
  }
  const { t } = translatorFor((body as { locale?: unknown } | null)?.locale)

  const callModel = model(req.signal)

  // With a model, every message is a paid call: a short window for floods and
  // a daily ceiling for slow, steady abuse, both counted. Button mode costs a
  // catalogue read, like the search box, and shares its limit.
  const service = createServiceClient()
  const ip = clientIp(req.headers)
  const checks = callModel
    ? await Promise.all([hitLimit(service, 'chat', ip), hitLimit(service, 'chatDaily', ip)])
    : [await hitLimit(service, 'search', ip)]
  const limited = checks.find((c) => !c.allowed) ?? null
  if (limited && !limited.allowed) {
    return NextResponse.json(
      { error: t('Chat.api.tooMany') },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  const parsed = chatRequestSchema.safeParse(body)
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.message === 'tooLong')
    return NextResponse.json({ error: t(tooLong ? 'Chat.api.tooLong' : 'Chat.api.invalid') }, { status: 400 })
  }
  const { locale, messages, action } = parsed.data

  const account = await createClient()
  const {
    data: { user },
  } = await account.auth.getUser()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const emit = (event: ChatEvent) => controller.enqueue(encoder.encode(encodeEvent(event)))

      const ctx = { catalogue: createPublicClient(), account, userId: user?.id ?? null, locale }
      try {
        if (callModel) {
          const outcome = await runChat({ callModel, system: systemPrompt(locale), history: modelHistory(messages), ctx, emit })
          if (outcome === 'refused') emit({ type: 'text', text: t('Chat.refused') })
          if (outcome === 'step_limit') emit({ type: 'text', text: t('Chat.stepLimit') })
        } else {
          await runMenu({ action, text: messages[messages.length - 1].content, ctx, emit })
        }
        emit({ type: 'done' })
      } catch (error) {
        if (req.signal.aborted) {
          // The shopper closed the chat; nobody is listening.
        } else {
          console.error('Chat API error:', loggable(error))
          emit({ type: 'error', code: errorCode(error) })
        }
      } finally {
        try {
          controller.close()
        } catch {
          // Already closed by the aborted request.
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      // Proxies must pass the reply on as it is written, not when it ends.
      'X-Accel-Buffering': 'no',
    },
  })
}
