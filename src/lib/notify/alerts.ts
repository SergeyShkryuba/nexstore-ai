/**
 * What the store owner hears about, and how it reads in each channel.
 * Pure: plain data in, strings out, so the wording is unit-tested.
 */

export type AlertLine = { title: string; quantity: number; size?: string | null }
export type LowStock = { title: string; size?: string | null; left: number }

export type OwnerAlert =
  | {
      kind: 'order'
      orderId: string
      total: number
      email: string | null
      /** "Madrid, ES" when the order has a delivery address. */
      place: string | null
      lines: AlertLine[]
      /** What this order left running low, if anything. */
      lowStock: LowStock[]
    }
  | {
      kind: 'support'
      email: string
      message: string
      /** The assistant's one-line summary of the chat. */
      summary: string | null
    }

const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })

const lineText = (l: AlertLine) => `${l.quantity} × ${l.title}${l.size ? ` (${l.size})` : ''}`
const stockText = (s: LowStock) => `${s.title}${s.size ? ` (${s.size})` : ''}: ${s.left === 0 ? 'sold out' : `${s.left} left`}`

function clip(text: string, chars: number): string {
  return text.length > chars ? `${text.slice(0, chars - 1)}…` : text
}

/** The headline, the same in every channel. */
export function alertTitle(alert: OwnerAlert): string {
  return alert.kind === 'order'
    ? `New order #${alert.orderId.slice(0, 8)}, ${euro.format(alert.total)}`
    : `Support request from ${alert.email}`
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Telegram, in its HTML parse mode: everything from the shop is escaped. */
export function telegramText(alert: OwnerAlert, adminUrl: string): string {
  const e = escapeHtml
  if (alert.kind === 'order') {
    return [
      `🛒 <b>${e(alertTitle(alert))}</b>`,
      ...alert.lines.map((l) => e(lineText(l))),
      [alert.email, alert.place].filter(Boolean).map((s) => e(s as string)).join(' · '),
      ...alert.lowStock.map((s) => `⚠️ Low stock: ${e(stockText(s))}`),
      `<a href="${e(`${adminUrl}/orders`)}">Open orders</a>`,
    ]
      .filter(Boolean)
      .join('\n')
  }
  return [
    `🙋 <b>${e(alertTitle(alert))}</b>`,
    alert.summary ? `<i>${e(clip(alert.summary, 500))}</i>` : '',
    e(clip(alert.message, 1500)),
    `<a href="${e(`${adminUrl}/support`)}">Open support</a>`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * WhatsApp template parameters must be one line: no newlines or tabs, and no
 * runs of more than four spaces, or Meta rejects the message.
 */
export function oneLine(text: string, chars = 900): string {
  return clip(text.replace(/[\r\n\t]+/g, ' · ').replace(/ {2,}/g, ' ').trim(), chars)
}

/**
 * Values for the `store_alert` template: {{1}} the headline, {{2}} the details.
 * Its body reads "NexStore AI: {{1}}. {{2}} Details in the admin panel."
 */
export function whatsappParams(alert: OwnerAlert): [string, string] {
  if (alert.kind === 'order') {
    const details = [
      alert.lines.map(lineText).join('; '),
      [alert.email, alert.place].filter(Boolean).join(', '),
      alert.lowStock.length ? `Low stock: ${alert.lowStock.map(stockText).join('; ')}` : '',
    ]
      .filter(Boolean)
      .join('. ')
    return [oneLine(alertTitle(alert), 120), oneLine(`${details}.`)]
  }
  const details = [alert.summary, `Message: "${alert.message}"`].filter(Boolean).join('. ')
  return [oneLine(alertTitle(alert), 120), oneLine(details)]
}
