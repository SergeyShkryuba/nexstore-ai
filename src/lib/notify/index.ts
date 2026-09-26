import { after } from 'next/server'
import { siteUrl } from '@/lib/site'
import { telegramText, whatsappParams, type OwnerAlert } from './alerts'
import { sendTelegram, sendWhatsAppTemplate, telegramConfig, whatsappConfig } from './channels'

export type { OwnerAlert } from './alerts'

/**
 * Tells the owner on every configured messenger. Never throws: a messenger
 * being down must not fail an order or a support request, so failures are
 * logged and the result says which channels got through.
 */
export async function notifyOwner(
  alert: OwnerAlert,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ telegram?: boolean; whatsapp?: boolean }> {
  const telegram = telegramConfig(env)
  const whatsapp = whatsappConfig(env)
  const adminUrl = `${siteUrl}/admin`

  const [tg, wa] = await Promise.allSettled([
    telegram ? sendTelegram(telegram, telegramText(alert, adminUrl)) : Promise.resolve(null),
    whatsapp ? sendWhatsAppTemplate(whatsapp, whatsappParams(alert)) : Promise.resolve(null),
  ])

  const result: { telegram?: boolean; whatsapp?: boolean } = {}
  if (telegram) result.telegram = tg.status === 'fulfilled'
  if (whatsapp) result.whatsapp = wa.status === 'fulfilled'
  if (tg.status === 'rejected') console.error(`Owner alert (${alert.kind}) not sent to Telegram:`, String(tg.reason))
  if (wa.status === 'rejected') console.error(`Owner alert (${alert.kind}) not sent to WhatsApp:`, String(wa.reason))
  return result
}

/**
 * `notifyOwner` after the response has gone out: Stripe and the shopper do
 * not wait for two messengers. On Vercel the function stays alive until it
 * finishes. Pass a function to also build the alert then (it may read the
 * database); if building fails, nothing is sent and the error is logged.
 */
export function notifyOwnerLater(alert: OwnerAlert | (() => Promise<OwnerAlert>)): void {
  after(async () => {
    try {
      await notifyOwner(typeof alert === 'function' ? await alert() : alert)
    } catch (error) {
      console.error('Owner alert not built:', error)
    }
  })
}
