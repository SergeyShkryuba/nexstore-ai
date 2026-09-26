import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { translatorFor } from '@/i18n/messages'
import { handleUpdate, localeOf, type TgUpdate } from '@/lib/telegram/bot'
import { botDeps } from '@/lib/telegram/deps'

export const runtime = 'nodejs'

function sameSecret(sent: string | null, expected: string): boolean {
  if (!sent) return false
  const a = Buffer.from(sent)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Telegram delivers the bot's updates here (see `npm run telegram -- webhook`).
 * The secret Telegram sends back proves the request is Telegram's. Answered
 * 200 even when handling fails: Telegram would otherwise redeliver the same
 * update again and again.
 */
export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  if (!token || !secret) return NextResponse.json({ error: 'Telegram bot is not configured' }, { status: 503 })

  if (!sameSecret(req.headers.get('x-telegram-bot-api-secret-token'), secret)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const update = (await req.json().catch(() => null)) as TgUpdate | null
  if (!update || typeof update.update_id !== 'number') return NextResponse.json({ ok: true })

  try {
    await handleUpdate(update, botDeps(token))
  } catch (error) {
    console.error('Telegram update failed:', String(error))
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id
    // Tell the shopper something went wrong rather than going silent.
    if (chatId) {
      const { t } = translatorFor(localeOf(update.message?.from ?? update.callback_query?.from))
      await botDeps(token)
        .send('sendMessage', { chat_id: chatId, text: t('Bot.telegram.failed') })
        .catch(() => {})
    }
  }
  return NextResponse.json({ ok: true })
}
