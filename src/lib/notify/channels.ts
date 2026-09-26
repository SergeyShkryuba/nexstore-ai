/**
 * The two messengers the owner is reached on. Each sender is configured by
 * environment variables and is simply skipped when they are missing, so the
 * store runs the same with none, one or both.
 */

const TIMEOUT_MS = 5000

export class ChannelError extends Error {}

/** Throws a `ChannelError` naming the status and the API's own error text, never the token. */
async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (res.ok) return
  const data = (await res.json().catch(() => null)) as
    | { description?: string; error?: { message?: string; code?: number } }
    | null
  const detail = data?.description ?? data?.error?.message ?? res.statusText
  throw new ChannelError(`HTTP ${res.status}: ${detail}`)
}

export type TelegramConfig = { token: string; chatId: string }

export function telegramConfig(env: NodeJS.ProcessEnv = process.env): TelegramConfig | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = env.TELEGRAM_CHAT_ID?.trim()
  return token && chatId ? { token, chatId } : null
}

/** Bot API sendMessage, in HTML parse mode (the text must already be escaped). */
export async function sendTelegram(config: TelegramConfig, html: string): Promise<void> {
  // The token is part of the URL: keep the URL out of every error message.
  await postJson(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    chat_id: config.chatId,
    text: html,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  })
}

export type WhatsAppConfig = {
  token: string
  phoneNumberId: string
  /** The owner's number, digits only, with the country code. */
  to: string
  template: string
  language: string
  apiVersion: string
}

export function whatsappConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig | null {
  const token = env.WHATSAPP_TOKEN?.trim()
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  const to = env.WHATSAPP_OWNER_NUMBER?.replace(/\D/g, '')
  if (!token || !phoneNumberId || !to) return null
  return {
    token,
    phoneNumberId,
    to,
    template: env.WHATSAPP_ALERT_TEMPLATE?.trim() || 'store_alert',
    language: env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'en',
    apiVersion: env.WHATSAPP_API_VERSION?.trim() || 'v26.0',
  }
}

/**
 * A template message through the WhatsApp Cloud API. A business may only start
 * a conversation with a template Meta has approved; free text is allowed only
 * within 24 hours of the person's last message.
 */
export async function sendWhatsAppTemplate(config: WhatsAppConfig, params: readonly string[]): Promise<void> {
  await postJson(
    `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: config.to,
      type: 'template',
      template: {
        name: config.template,
        language: { code: config.language },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    },
    { Authorization: `Bearer ${config.token}` },
  )
}
