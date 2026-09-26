import Anthropic from '@anthropic-ai/sdk'
import { createPublicClient } from '@/utils/supabase/public'
import { createServiceClient } from '@/utils/supabase/service'
import { hitLimit } from '@/lib/rate-limit'
import { searchCatalogue } from '@/lib/search-service'
import { PRODUCT_TRANSLATIONS, localizeProducts } from '@/lib/localized'
import { loadNavCategories } from '@/lib/nav-categories'
import { notifyOwnerLater } from '@/lib/notify'
import { siteUrl } from '@/lib/site'
import { anthropicModel, runChat } from '@/lib/chat/agent'
import { systemPrompt } from '@/lib/chat/prompt'
import type { BotDeps, BotProduct } from './bot'

/** A Bot API call. Errors name Telegram's reason, never the token (it is in the URL). */
export async function telegramApi(token: string, method: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  })
  if (res.ok) return
  const data = (await res.json().catch(() => null)) as { description?: string } | null
  throw new Error(`Telegram ${method}: HTTP ${res.status} ${data?.description ?? ''}`.trim())
}

/** `%` and `_` are wildcards in ILIKE; an email should match only itself. */
const likeLiteral = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`)

type ProductRow = BotProduct & { id: string; translations?: never[] | null }

let anthropic: Anthropic | undefined

/** The bot wired to the database, Telegram and (with a key) Claude. */
export function botDeps(token: string): BotDeps {
  const catalogue = createPublicClient()
  const service = createServiceClient()

  return {
    send: (method, payload) => telegramApi(token, method, payload),
    siteUrl: siteUrl.startsWith('https://') ? siteUrl : null,

    async search(query, locale) {
      const result = await searchCatalogue(catalogue, query, locale)
      return { maxPrice: result.maxPrice, products: result.results.map((r) => r.product) }
    },

    categories: (locale) => loadNavCategories(locale),

    async categoryProducts(slug, locale) {
      const { data: category } = await catalogue.from('categories').select('id').eq('slug', slug).maybeSingle()
      if (!category) return []
      const { data } = await catalogue
        .from('products')
        .select(`id, slug, title, price, inventory_count, ${PRODUCT_TRANSLATIONS}`)
        .eq('category_id', category.id)
        .order('created_at', { ascending: false })
        .limit(6)
      return localizeProducts((data ?? []) as ProductRow[], locale)
    },

    async findOrder(ref, email) {
      if (!service) return null
      // The number is the first 8 hex digits of the id: every id starting with
      // them lies between these two. The email must match too.
      const { data, error } = await service
        .from('orders')
        .select('id, created_at, status, total_amount, order_items(quantity)')
        .gte('id', `${ref}-0000-0000-0000-000000000000`)
        .lte('id', `${ref}-ffff-ffff-ffff-ffffffffffff`)
        .ilike('customer_email', likeLiteral(email))
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        id: data.id as string,
        created_at: data.created_at as string,
        status: data.status as string,
        total: Number(data.total_amount),
        itemCount: ((data.order_items ?? []) as Array<{ quantity: number }>).reduce((n, i) => n + i.quantity, 0),
      }
    },

    async saveSupport({ email, message, summary, locale }) {
      if (!service) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
      const { error } = await service.from('support_requests').insert({ email, message, summary, locale })
      if (error) throw error
      notifyOwnerLater({ kind: 'support', email, message, summary })
    },

    async allow(limit, chatId) {
      return (await hitLimit(service, limit, `tg:${chatId}`)).allowed
    },

    // One message at a time: the bot keeps no chat history.
    ai: process.env.ANTHROPIC_API_KEY
      ? async (text, locale) => {
          anthropic ??= new Anthropic({ maxRetries: 1 })
          let reply = ''
          const products: BotProduct[] = []
          let handoff = false
          await runChat({
            callModel: anthropicModel(anthropic),
            system: systemPrompt(locale),
            history: [{ role: 'user', content: text }],
            ctx: { catalogue, account: catalogue, userId: null, locale },
            emit: (event) => {
              if (event.type === 'text') reply += event.text
              if (event.type === 'products') products.push(...event.products)
              if (event.type === 'handoff') handoff = true
            },
          })
          return { text: reply.trim(), products, handoff }
        }
      : undefined,
  }
}
