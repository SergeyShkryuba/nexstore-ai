import { translatorFor } from '@/i18n/messages'
import { LOCALES, localizedPath, type Locale } from '@/i18n/routing'
import { formatDate, formatPrice } from '@/lib/format'
import { orderStatusKey } from '@/lib/orders'
import { infoPageText } from '@/lib/policies'
import { MENU_ACTIONS, type MenuAction } from '@/lib/chat/actions'

/**
 * The shop's Telegram bot, in button mode: a menu under the input field, the
 * catalogue by category, keyword search for anything typed, an order's status
 * by number and email, and a message to the team. Optionally, typed text goes
 * to the AI instead of the keyword search.
 *
 * It keeps no conversation state: a question that needs an answer (the order
 * number, the message to the team) is sent as a "force reply", and the answer
 * is recognised by the question it replies to.
 */

// ---- The parts of a Telegram update this bot reads --------------------------

export type TgUser = { id: number; is_bot?: boolean; username?: string; first_name?: string; language_code?: string }
export type TgChat = { id: number; type: string }
export type TgMessage = {
  message_id: number
  chat: TgChat
  from?: TgUser
  text?: string
  reply_to_message?: { text?: string; from?: TgUser }
}
export type TgUpdate = {
  update_id: number
  message?: TgMessage
  callback_query?: { id: string; from: TgUser; data?: string; message?: { chat: TgChat } }
}

// ---- What the bot needs from the rest of the app ----------------------------

export type BotProduct = { slug: string; title: string; price: number; inventory_count: number }
export type BotOrder = { id: string; created_at: string; status: string; total: number; itemCount: number }
export type BotLimit = 'search' | 'support' | 'orderLookup'

export type BotDeps = {
  /** A Bot API call. */
  send: (method: string, payload: Record<string, unknown>) => Promise<void>
  /** The shop's public https address, for link buttons; null (e.g. localhost) sends no links. */
  siteUrl: string | null
  search: (query: string, locale: Locale) => Promise<{ maxPrice: number | null; products: BotProduct[] }>
  categories: (locale: Locale) => Promise<Array<{ slug: string; name: string }>>
  categoryProducts: (slug: string, locale: Locale) => Promise<BotProduct[]>
  /** The order with this number whose buyer paid with this email, or null. */
  findOrder: (ref: string, email: string) => Promise<BotOrder | null>
  saveSupport: (request: { email: string; message: string; summary: string; locale: Locale }) => Promise<void>
  /** Counts one use against a limit; false when it is spent. */
  allow: (limit: BotLimit, chatId: number) => Promise<boolean>
  /** Set when an AI key is configured: typed text is answered by it instead of the keyword search. */
  ai?: (text: string, locale: Locale) => Promise<{ text: string; products: BotProduct[]; handoff: boolean }>
}

/** Products listed per answer, each with a link button. */
const MAX_PRODUCTS = 6

/** Telegram's language, where the shop has it; English otherwise. */
export function localeOf(user: TgUser | undefined): Locale {
  const code = user?.language_code?.slice(0, 2)
  return code === 'es' || code === 'ru' ? code : 'en'
}

const tr = (locale: Locale) => translatorFor(locale).t

/** The menu button this text is, in any of the shop's languages. */
export function menuActionOf(text: string): MenuAction | 'catalog' | null {
  for (const locale of LOCALES) {
    const t = tr(locale)
    if (text === t('Bot.menu.catalog')) return 'catalog'
    for (const action of MENU_ACTIONS) if (text === t(`Bot.menu.${action}`)) return action
  }
  return null
}

/** Which of our questions a reply answers, in any language. */
function answeredQuestion(reply: TgMessage['reply_to_message']): 'order' | 'contact' | null {
  if (!reply?.from?.is_bot || !reply.text) return null
  for (const locale of LOCALES) {
    const t = tr(locale)
    if (reply.text.includes(t('Bot.telegram.ordersAsk'))) return 'order'
    if (reply.text.includes(t('Bot.telegram.contactAsk'))) return 'contact'
  }
  return null
}

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/

/** "3f9a1c2b ana@example.com", "#3F9A1C2B, ana@example.com" → the number's first 8 hex digits and the email. */
export function parseOrderLookup(text: string): { ref: string; email: string } | null {
  const email = text.match(EMAIL)?.[0]
  const ref = text.replace(EMAIL, ' ').match(/#?([0-9a-f]{8})(?:-[0-9a-f-]*)?/i)?.[1]
  return email && ref ? { ref: ref.toLowerCase(), email: email.toLowerCase() } : null
}

function menuKeyboard(locale: Locale) {
  const t = tr(locale)
  const b = (item: MenuAction | 'catalog') => ({ text: t(`Bot.menu.${item}`) })
  return {
    keyboard: [[b('search'), b('catalog')], [b('orders'), b('shipping')], [b('human')]],
    resize_keyboard: true,
    is_persistent: true,
  }
}

export async function handleUpdate(update: TgUpdate, deps: BotDeps): Promise<void> {
  if (update.callback_query) return handleCallback(update.callback_query, deps)

  const message = update.message
  // Private chats only: in a group, the bot would answer everyone's messages.
  if (!message || message.chat.type !== 'private' || message.from?.is_bot) return

  const chatId = message.chat.id
  const locale = localeOf(message.from)
  const t = tr(locale)
  const say = (text: string, extra: Record<string, unknown> = {}) =>
    deps.send('sendMessage', { chat_id: chatId, text, link_preview_options: { is_disabled: true }, ...extra })
  const ask = (text: string) => say(text, { reply_markup: { force_reply: true } })
  const text = message.text?.trim() ?? ''

  if (!text || text.startsWith('/start') || text.startsWith('/menu') || text.startsWith('/help')) {
    await say(t('Bot.greeting'), { reply_markup: menuKeyboard(locale) })
    return
  }

  switch (answeredQuestion(message.reply_to_message)) {
    case 'order': {
      const lookup = parseOrderLookup(text)
      if (!lookup) return ask(`${t('Bot.telegram.orderBadFormat')}\n\n${t('Bot.telegram.ordersAsk')}`)
      if (!(await deps.allow('orderLookup', chatId))) return say(t('Bot.telegram.tooMany'))
      const order = await deps.findOrder(lookup.ref, lookup.email)
      if (!order) return say(t('Bot.telegram.orderNotFound'))
      return say(
        t('Bot.telegram.orderStatus', {
          id: order.id.slice(0, 8),
          date: formatDate(order.created_at, locale),
          status: t(`OrderStatus.${orderStatusKey(order.status)}`),
          total: formatPrice(order.total, locale),
          items: t('Chat.orders.items', { count: order.itemCount }),
        }),
      )
    }
    case 'contact': {
      const email = text.match(EMAIL)?.[0]
      if (!email) return ask(`${t('Bot.telegram.contactNoEmail')}\n\n${t('Bot.telegram.contactAsk')}`)
      if (!(await deps.allow('support', chatId))) return say(t('Bot.telegram.tooMany'))
      const who = message.from?.username ? `@${message.from.username}` : (message.from?.first_name ?? 'a shopper')
      await deps.saveSupport({
        email,
        message: text.slice(0, 2000),
        summary: `Sent from Telegram by ${who} (chat ${chatId}).`,
        locale,
      })
      return say(t('Bot.telegram.contactSent', { email }))
    }
  }

  switch (menuActionOf(text)) {
    case 'search':
      return say(t('Bot.askSearch'))
    case 'catalog': {
      const categories = await deps.categories(locale)
      return say(t('Bot.catalogIntro'), {
        reply_markup: {
          inline_keyboard: categories.map((c) => [{ text: c.name, callback_data: `cat:${c.slug}`.slice(0, 64) }]),
        },
      })
    }
    case 'orders':
      return ask(t('Bot.telegram.ordersAsk'))
    case 'shipping':
      return say(`${t('Bot.shippingIntro')}\n\n${infoPageText('shipping', locale)}`)
    case 'human':
      return ask(t('Bot.telegram.contactAsk'))
  }

  if (!(await deps.allow('search', chatId))) return say(t('Bot.telegram.tooMany'))

  if (deps.ai) {
    const answer = await deps.ai(text.slice(0, 1000), locale)
    await sendProducts(deps, chatId, locale, answer.text, answer.products)
    if (answer.handoff) await ask(t('Bot.telegram.contactAsk'))
    return
  }

  const result = await deps.search(text.slice(0, 200), locale)
  if (result.products.length === 0) return say(t('Bot.notFound'))
  const intro =
    result.maxPrice !== null ? t('Bot.foundBudget', { amount: formatPrice(result.maxPrice, locale) }) : t('Bot.found')
  await sendProducts(deps, chatId, locale, intro, result.products)
}

async function handleCallback(query: NonNullable<TgUpdate['callback_query']>, deps: BotDeps): Promise<void> {
  // Stop the button's spinner whatever happens next.
  await deps.send('answerCallbackQuery', { callback_query_id: query.id })
  const chat = query.message?.chat
  if (!chat || chat.type !== 'private' || !query.data?.startsWith('cat:')) return

  const locale = localeOf(query.from)
  const t = tr(locale)
  const products = await deps.categoryProducts(query.data.slice(4), locale)
  if (products.length === 0) {
    await deps.send('sendMessage', { chat_id: chat.id, text: t('Bot.categoryEmpty') })
    return
  }
  const name = (await deps.categories(locale)).find((c) => c.slug === query.data!.slice(4))?.name
  await sendProducts(deps, chat.id, locale, name ? `${name}:` : t('Bot.found'), products)
}

/** A numbered list with prices, and a link button per product to its page in the shopper's language. */
async function sendProducts(deps: BotDeps, chatId: number, locale: Locale, intro: string, products: BotProduct[]) {
  const t = tr(locale)
  const shown = products.slice(0, MAX_PRODUCTS)
  const lines = shown.map(
    (p, i) =>
      `${i + 1}. ${p.title} — ${formatPrice(p.price, locale)}${p.inventory_count <= 0 ? ` (${t('Chat.soldOut')})` : ''}`,
  )
  const base = deps.siteUrl
  const url = (path: string) => `${base}${localizedPath(path, locale)}`
  await deps.send('sendMessage', {
    chat_id: chatId,
    text: [intro, ...(lines.length ? ['', ...lines] : [])].join('\n'),
    link_preview_options: { is_disabled: true },
    // Telegram accepts only public https links in buttons.
    ...(base
      ? {
          reply_markup: {
            inline_keyboard: [
              ...shown.map((p, i) => [{ text: `${i + 1}. ${p.title}`.slice(0, 60), url: url(`/product/${p.slug}`) }]),
              [{ text: t('Bot.telegram.openSite'), url: url('/') }],
            ],
          },
        }
      : {}),
  })
}
