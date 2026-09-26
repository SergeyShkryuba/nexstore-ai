import { translatorFor } from '@/i18n/messages'
import { formatPrice } from '@/lib/format'
import { infoPageText } from '@/lib/policies'
import { searchCatalogue } from '@/lib/search-service'
import type { ChatEvent } from './events'
import { productCard, runTool, type ToolContext } from './tools'
import type { MenuAction } from './actions'

/**
 * The assistant without a model: menu buttons and keyword search. It answers
 * the same four needs as the AI (find a product, my orders, delivery and
 * returns, a person) from the same tools, so switching the AI on later
 * changes how a question is understood, not what the shopper can get.
 */

/** Products shown per search. */
const MAX_RESULTS = 6

export async function runMenu({
  action,
  text,
  ctx,
  emit,
}: {
  /** A button the shopper pressed; without one, `text` is a search. */
  action?: MenuAction
  text: string
  ctx: ToolContext
  emit: (event: ChatEvent) => void
}): Promise<void> {
  const { t } = translatorFor(ctx.locale)
  const say = (message: string) => emit({ type: 'text', text: message })

  switch (action) {
    case 'search':
      say(t('Bot.askSearch'))
      return
    case 'orders': {
      const outcome = await runTool('get_my_orders', {}, ctx)
      if (outcome.event?.type === 'orders' && outcome.event.signedIn && outcome.event.orders.length > 0) {
        say(t('Bot.ordersIntro'))
      }
      if (outcome.event) emit(outcome.event)
      return
    }
    case 'shipping':
      say(`${t('Bot.shippingIntro')}\n\n${infoPageText('shipping', ctx.locale)}`)
      return
    case 'human':
      say(t('Bot.humanIntro'))
      emit({ type: 'handoff', summary: '' })
      return
  }

  // Typed text: a search in the shopper's own language.
  const search = await searchCatalogue(ctx.catalogue, text, ctx.locale)
  const hits = search.results.slice(0, MAX_RESULTS).map((r) => r.product)
  if (hits.length === 0) {
    say(t('Bot.notFound'))
    return
  }
  say(
    search.maxPrice !== null
      ? t('Bot.foundBudget', { amount: formatPrice(search.maxPrice, ctx.locale) })
      : t('Bot.found'),
  )
  emit({ type: 'products', products: hits.map(productCard) })
}
